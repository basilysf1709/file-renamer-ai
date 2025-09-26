from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aws_region: str = "us-east-1"
    s3_in_bucket: str
    s3_out_bucket: str
    sqs_queue_url: str
    model_id: str = "Qwen/Qwen2-VL-2B-Instruct"
    max_pixels: int = 786432  # ~0.75MP
    max_new_tokens: int = 15
    batch_size: int = 12
    api_port: int = 80

    class Config:
        env_file = ".env"


settings = Settings() 