from typing import List, Tuple
import io
import tempfile
import os
import asyncio
import threading
import hashlib
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from PIL import Image
import torch
from transformers import AutoModelForVision2Seq, AutoProcessor, BitsAndBytesConfig
from settings import settings
from naming import to_kebab, system_prompt

# Import for HEIC support
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF_AVAILABLE = True
except ImportError:
    HEIF_AVAILABLE = False

# Import for SVG support
try:
    import cairosvg
    SVG_AVAILABLE = True
except ImportError:
    SVG_AVAILABLE = False


class OptimizedVLM:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Initializing VLM on device: {self.device}")
        
        self.processor = AutoProcessor.from_pretrained(settings.model_id)
        
        # Optimized 8-bit quantization for speed + cost balance
        quantization_config = None
        if settings.quantization and self.device == "cuda":
            if settings.quantization == "8bit":
                quantization_config = BitsAndBytesConfig(
                    load_in_8bit=True,
                    bnb_8bit_compute_dtype=torch.float16,
                    bnb_8bit_use_double_quant=False
                )
            elif settings.quantization == "4bit":
                quantization_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_compute_dtype=torch.float16
                )
        
        self.model = AutoModelForVision2Seq.from_pretrained(
            settings.model_id,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            low_cpu_mem_usage=True,
            quantization_config=quantization_config,
            device_map="auto" if quantization_config else None,
            # Additional memory optimizations
            max_memory={0: "13GB", "cpu": "30GB"} if self.device == "cuda" else {"cpu": "15GB"},
            offload_folder="./model_offload" if self.device == "cuda" else None,
            torch_compile=False  # Disable torch.compile to save memory
        )
        
        # Only move to device if not using quantization (device_map handles it)
        if not quantization_config:
            self.model = self.model.to(self.device)
        
        # Get actual model device for proper tensor placement
        if hasattr(self.model, 'device'):
            self.model_device = self.model.device
        else:
            self.model_device = next(self.model.parameters()).device
        
        # Fixed thread pool for parallel image preprocessing
        self.thread_pool = ThreadPoolExecutor(max_workers=settings.parallel_downloads)
        
        # Image cache for repeated processing (LRU cache with size limit)
        self._preprocess_cache = {}
        self._cache_max_size = 100  # Limit cache size to prevent memory bloat
        self._cache_lock = threading.Lock()
        
        print(f"✅ VLM initialized on {self.model_device}")

    def _get_image_hash(self, b: bytes) -> str:
        """Generate hash for image caching"""
        return hashlib.md5(b).hexdigest()[:16]

    def _get_cached_image(self, img_hash: str) -> Image.Image:
        """Thread-safe cache retrieval"""
        with self._cache_lock:
            return self._preprocess_cache.get(img_hash)

    def _cache_image(self, img_hash: str, image: Image.Image):
        """Thread-safe cache storage with size limit"""
        with self._cache_lock:
            # Implement simple LRU by removing oldest entries
            if len(self._preprocess_cache) >= self._cache_max_size:
                # Remove oldest 20% of entries
                items_to_remove = len(self._preprocess_cache) // 5
                for _ in range(items_to_remove):
                    self._preprocess_cache.pop(next(iter(self._preprocess_cache)))
            
            self._preprocess_cache[img_hash] = image

    def preprocess_img(self, b: bytes) -> Image.Image:
        """Memory-optimized image preprocessing with caching"""
        # Check cache first
        img_hash = self._get_image_hash(b)
        cached_img = self._get_cached_image(img_hash)
        if cached_img is not None:
            return cached_img.copy()  # Return copy to avoid modification issues
        
        im = None
        temp_path = None
        
        try:
            # First try direct PIL opening (handles JPEG, PNG, etc.)
            with io.BytesIO(b) as bio:
                im = Image.open(bio).convert("RGB")
        except Exception as e:
            # If direct opening fails, try alternative formats
            try:
                # Try SVG conversion first (no temp file needed)
                if SVG_AVAILABLE and (b[:5] == b'<?xml' or b'<svg' in b[:100]):
                    png_data = cairosvg.svg2png(bytestring=b)
                    with io.BytesIO(png_data) as bio:
                        im = Image.open(bio).convert("RGB")
                else:
                    # For HEIC and other formats, use secure temp file
                    temp_path = f"/tmp/img_{img_hash}_{os.getpid()}"
                    try:
                        with open(temp_path, 'wb') as f:
                            f.write(b)
                        im = Image.open(temp_path).convert("RGB")
                    finally:
                        if temp_path and os.path.exists(temp_path):
                            os.unlink(temp_path)
                            
            except Exception as e2:
                raise ValueError(f"Unsupported image format. Original error: {e}, Secondary error: {e2}")
        
        if im is None:
            raise ValueError("Failed to load image")
        
        # Optimized resize for better GPU utilization
        long = max(im.size)
        target_long = int((settings.max_pixels)**0.5)
        if long > target_long:
            scale = target_long / long
            # Use high-quality resampling for better AI recognition
            im = im.resize((int(im.width*scale), int(im.height*scale)), Image.Resampling.LANCZOS)
        
        # Cache the processed image
        self._cache_image(img_hash, im)
        
        return im

    def _get_dynamic_batch_size(self, num_images: int) -> int:
        """Calculate optimal batch size based on available GPU memory"""
        if not torch.cuda.is_available():
            return min(settings.max_batch_size, num_images)
        
        try:
            # Get GPU memory info
            gpu_memory = torch.cuda.get_device_properties(0).total_memory
            allocated_memory = torch.cuda.memory_allocated()
            available_memory = gpu_memory - allocated_memory
            
            # Estimate memory per image (rough heuristic)
            memory_per_image = 50 * 1024 * 1024  # 50MB per image (conservative estimate)
            safe_batch_size = max(1, int(available_memory * 0.7 / memory_per_image))  # Use 70% of available memory
            
            return min(settings.max_batch_size, safe_batch_size, num_images)
        except:
            # Fallback to conservative batch size
            return min(2, settings.max_batch_size, num_images)

    @torch.inference_mode()
    def predict_names_optimized(self, images: List[bytes], user_prompt: str) -> List[str]:
        """GPU memory optimized batch processing with parallel preprocessing"""
        if not images:
            return []
        
        print(f"🔄 Processing {len(images)} images with optimized pipeline...")
        
        # Parallel image preprocessing (FIXED: removed incorrect 'with' statement)
        try:
            imgs = list(self.thread_pool.map(self.preprocess_img, images))
            print(f"✅ Preprocessed {len(imgs)} images in parallel")
        except Exception as e:
            print(f"❌ Error in parallel preprocessing: {e}")
            # Fallback to sequential processing
            imgs = [self.preprocess_img(img_bytes) for img_bytes in images]
        
        # Dynamic batch sizing based on GPU memory
        dynamic_batch_size = self._get_dynamic_batch_size(len(imgs))
        print(f"📊 Using dynamic batch size: {dynamic_batch_size}")
        
        all_results = []
        
        for i in range(0, len(imgs), dynamic_batch_size):
            batch_imgs = imgs[i:i + dynamic_batch_size]
            prompts = [system_prompt() + (f" {user_prompt}" if user_prompt else "")] * len(batch_imgs)
            
            print(f"🔄 Processing batch {i//dynamic_batch_size + 1}/{(len(imgs) + dynamic_batch_size - 1)//dynamic_batch_size}")
            
            # Process batch with proper memory management
            try:
                inputs = self.processor(text=prompts, images=batch_imgs, return_tensors="pt", padding=True)
                
                # Move to correct device (handle device_map scenarios)
                inputs = {k: v.to(self.model_device) if hasattr(v, 'to') else v for k, v in inputs.items()}
                
                generate_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=settings.max_new_tokens,
                    do_sample=False,
                    temperature=0.0,
                    pad_token_id=self.processor.tokenizer.eos_token_id
                )
                
                batch_results = self.processor.batch_decode(generate_ids, skip_special_tokens=True)
                all_results.extend([to_kebab(o) for o in batch_results])
                
                print(f"✅ Batch {i//dynamic_batch_size + 1} completed")
                
            except torch.cuda.OutOfMemoryError as e:
                print(f"⚠️ GPU OOM in batch {i//dynamic_batch_size + 1}, falling back to smaller batches")
                # Clear cache and retry with smaller batch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                # Process images one by one as fallback
                for j, (img, prompt) in enumerate(zip(batch_imgs, prompts)):
                    try:
                        single_result = self._process_single_image(img, prompt)
                        all_results.append(single_result)
                    except Exception as e2:
                        print(f"❌ Failed to process image {i+j}: {e2}")
                        all_results.append(f"error-image-{i+j}")
                        
            except Exception as e:
                print(f"❌ Error processing batch {i//dynamic_batch_size + 1}: {e}")
                # Add error placeholders for failed batch
                all_results.extend([f"error-image-{i+j}" for j in range(len(batch_imgs))])
                
            finally:
                # Clear GPU memory after each batch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
        
        print(f"🎉 Completed processing {len(all_results)} images")
        return all_results

    def _process_single_image(self, img: Image.Image, prompt: str) -> str:
        """Process single image (helper for OOM fallback)"""
        inputs = self.processor(text=[prompt], images=[img], return_tensors="pt", padding=True)
        inputs = {k: v.to(self.model_device) if hasattr(v, 'to') else v for k, v in inputs.items()}
        
        generate_ids = self.model.generate(
            **inputs,
            max_new_tokens=settings.max_new_tokens,
            do_sample=False,
            temperature=0.0,
            pad_token_id=self.processor.tokenizer.eos_token_id
        )
        
        out = self.processor.batch_decode(generate_ids, skip_special_tokens=True)[0]
        return to_kebab(out)

    @torch.inference_mode()
    def predict_single(self, image_bytes: bytes, user_prompt: str) -> str:
        """Optimized single image processing for preview endpoint"""
        img = self.preprocess_img(image_bytes)
        prompt = system_prompt() + (f" {user_prompt}" if user_prompt else "")
        
        try:
            return self._process_single_image(img, prompt)
        except torch.cuda.OutOfMemoryError:
            # Clear cache and retry
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            return self._process_single_image(img, prompt)
        except Exception as e:
            print(f"❌ Error in single prediction: {e}")
            raise

    # Backward compatibility
    def predict_names(self, images: List[bytes], user_prompt: str) -> List[str]:
        return self.predict_names_optimized(images, user_prompt)

    def __del__(self):
        """Cleanup resources"""
        try:
            if hasattr(self, 'thread_pool'):
                self.thread_pool.shutdown(wait=False)
        except:
            pass


# Thread-safe singleton with double-check locking
_vlm_lock = threading.Lock()
vlm = None


def get_vlm() -> OptimizedVLM:
    """Thread-safe singleton VLM instance"""
    global vlm
    if vlm is None:
        with _vlm_lock:
            if vlm is None:  # Double-check locking pattern
                print("🤖 Initializing VLM model (singleton)...")
                vlm = OptimizedVLM()
                print("✅ VLM model ready for use!")
    return vlm
