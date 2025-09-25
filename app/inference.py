from typing import List, Tuple
import io
from PIL import Image
import torch
from transformers import AutoModelForVision2Seq, AutoProcessor
from settings import settings
from naming import to_kebab, system_prompt


class VLM:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = AutoProcessor.from_pretrained(settings.model_id)
        self.model = AutoModelForVision2Seq.from_pretrained(
            settings.model_id,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            low_cpu_mem_usage=True
        ).to(self.device)

    def preprocess_img(self, b: bytes) -> Image.Image:
        im = Image.open(io.BytesIO(b)).convert("RGB")
        # Resize via processor settings using max_pixels hint
        # (Some processors accept max_pixels in __call__ kwargs)
        long = max(im.size)
        target_long = int((settings.max_pixels)**0.5)
        if long > target_long:
            scale = target_long / long
            im = im.resize((int(im.width*scale), int(im.height*scale)))
        return im

    @torch.inference_mode()
    def predict_names(self, images: List[bytes], user_prompt: str) -> List[str]:
        imgs = [self.preprocess_img(b) for b in images]
        prompts = [system_prompt() + (f" {user_prompt}" if user_prompt else "")] * len(imgs)
        inputs = self.processor(text=prompts, images=imgs, return_tensors="pt", padding=True).to(self.device)
        generate_ids = self.model.generate(
            **inputs,
            max_new_tokens=settings.max_new_tokens,
            do_sample=False,
            temperature=0.0
        )
        outs = self.processor.batch_decode(generate_ids, skip_special_tokens=True)
        return [to_kebab(o) for o in outs]


vlm = None


def get_vlm() -> VLM:
    global vlm
    if vlm is None:
        vlm = VLM()
    return vlm 