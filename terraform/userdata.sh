#!/usr/bin/env bash
set -euxo pipefail

# NVIDIA drivers & Docker
apt-get update -y
apt-get install -y docker.io docker-compose python3-pip unzip git jq
usermod -aG docker ubuntu || true

# Install NVIDIA container toolkit (for GPU)
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update -y
apt-get install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker || true
systemctl restart docker

# Pull app repo (you'll push it later)
cd /opt
if [ ! -d renamer-ai ]; then
  git clone https://github.com/placeholder/renamer-ai.git || {
    echo "Repository not found, creating empty directory structure"
    mkdir -p renamer-ai/app
  }
fi
cd renamer-ai/app

# Create env file
cat > .env <<EOF
AWS_REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
S3_IN_BUCKET=${bucket_in}
S3_OUT_BUCKET=${bucket_out}
SQS_QUEUE_URL=${queue_url}
MODEL_ID=Qwen/Qwen2-VL-2B-Instruct
MAX_PIXELS=786432   # ~0.75MP
MAX_NEW_TOKENS=15
BATCH_SIZE=12
API_PORT=80
EOF

# Start services (only if docker-compose.yml exists)
if [ -f docker-compose.yml ]; then
  /usr/local/bin/docker-compose --env-file .env up -d --pull=always
else
  echo "docker-compose.yml not found, skipping service startup"
fi 