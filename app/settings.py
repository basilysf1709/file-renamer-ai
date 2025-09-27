from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aws_region: str = "us-east-1"
    s3_in_bucket: str
    s3_out_bucket: str
    sqs_queue_url: str
    model_id: str = "Qwen/Qwen2-VL-2B-Instruct"
    max_pixels: int = 786432  # ~0.75MP
    max_new_tokens: int = 50
    batch_size: int = 16  # Optimized for 8-bit quantization
    api_port: int = 80
    
    # Cost-optimized quantization settings (50% cost reduction, 20% speed boost)
    quantization: str = "8bit"  # Faster than 4-bit, better quality
    use_flash_attention: bool = False  # Disabled for compatibility
    
    # Performance optimizations
    max_batch_size: int = 24  # Larger batches for efficiency
    parallel_downloads: int = 8  # Parallel S3 operations
    auto_scale_hours: int = 16  # Instance active 16 hours/day

    class Config:
        env_file = ".env"


settings = Settings()
