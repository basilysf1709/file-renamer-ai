from typing import List, Tuple
import io
import tempfile
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
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
        self.processor = AutoProcessor.from_pretrained(settings.model_id)
        
        # Optimized 8-bit quantization for speed + cost balance
        quantization_config = None
        if settings.quantization and self.device == "cuda":
            if settings.quantization == "8bit":
                quantization_config = BitsAndBytesConfig(
                    load_in_8bit=True,
                    bnb_8bit_compute_dtype=torch.float16,
                    bnb_8bit_use_double_quant=False  # Faster, slightly less memory efficient
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
            device_map="auto" if quantization_config else None
        )
        
        # Only move to device if not using quantization (device_map handles it)
        if not quantization_config:
            self.model = self.model.to(self.device)
        
        # Thread pool for parallel image preprocessing
        self.thread_pool = ThreadPoolExecutor(max_workers=settings.parallel_downloads)

    def preprocess_img(self, b: bytes) -> Image.Image:
        """Optimized image preprocessing with format detection"""
        try:
            # First try direct PIL opening (handles JPEG, PNG, etc.)
            im = Image.open(io.BytesIO(b)).convert("RGB")
        except Exception as e:
            # If direct opening fails, try alternative formats
            try:
                # Try SVG conversion
                if SVG_AVAILABLE and (b[:5] == b'<?xml' or b'<svg' in b[:100]):
                    # Convert SVG to PNG first
                    png_data = cairosvg.svg2png(bytestring=b)
                    im = Image.open(io.BytesIO(png_data)).convert("RGB")
                else:
                    # For HEIC and other formats, save to temp file and try again
                    with tempfile.NamedTemporaryFile(delete=False) as tmp:
                        tmp.write(b)
                        tmp.flush()
                        try:
                            im = Image.open(tmp.name).convert("RGB")
                        finally:
                            os.unlink(tmp.name)
            except Exception as e2:
                raise ValueError(f"Unsupported image format. Original error: {e}, Secondary error: {e2}")
        
        # Optimized resize for better GPU utilization
        long = max(im.size)
        target_long = int((settings.max_pixels)**0.5)
        if long > target_long:
            scale = target_long / long
            # Use high-quality resampling for better AI recognition
            im = im.resize((int(im.width*scale), int(im.height*scale)), Image.Resampling.LANCZOS)
        return im

    @torch.inference_mode()
    def predict_names_optimized(self, images: List[bytes], user_prompt: str) -> List[str]:
        """Optimized batch processing with parallel preprocessing"""
        # Parallel image preprocessing
        with self.thread_pool:
            imgs = list(self.thread_pool.map(self.preprocess_img, images))
        
        # Process in optimized batches
        batch_size = min(settings.max_batch_size, len(images))
        all_results = []
        
        for i in range(0, len(imgs), batch_size):
            batch_imgs = imgs[i:i + batch_size]
            prompts = [system_prompt() + (f" {user_prompt}" if user_prompt else "")] * len(batch_imgs)
            
            # Optimized GPU processing
            inputs = self.processor(text=prompts, images=batch_imgs, return_tensors="pt", padding=True).to(self.device)
            
            generate_ids = self.model.generate(
                **inputs,
                max_new_tokens=settings.max_new_tokens,
                do_sample=False,
                temperature=0.0,
                pad_token_id=self.processor.tokenizer.eos_token_id
            )
            
            batch_results = self.processor.batch_decode(generate_ids, skip_special_tokens=True)
            all_results.extend([to_kebab(o) for o in batch_results])
        
        return all_results

    @torch.inference_mode()
    def predict_single(self, image_bytes: bytes, user_prompt: str) -> str:
        """Optimized single image processing for preview endpoint"""
        img = self.preprocess_img(image_bytes)
        prompt = system_prompt() + (f" {user_prompt}" if user_prompt else "")
        inputs = self.processor(text=[prompt], images=[img], return_tensors="pt", padding=True).to(self.device)
        generate_ids = self.model.generate(
            **inputs,
            max_new_tokens=settings.max_new_tokens,
            do_sample=False,
            temperature=0.0,
            pad_token_id=self.processor.tokenizer.eos_token_id
        )
        out = self.processor.batch_decode(generate_ids, skip_special_tokens=True)[0]
        return to_kebab(out)

    # Backward compatibility
    def predict_names(self, images: List[bytes], user_prompt: str) -> List[str]:
        return self.predict_names_optimized(images, user_prompt)


vlm = None


def get_vlm() -> OptimizedVLM:
    global vlm
    if vlm is None:
        vlm = OptimizedVLM()
    return vlm
