#!/usr/bin/env bash
# ==================================================================
# AI Meeting Intelligence System - Production Deployment Script
# ==================================================================
set -e

echo "🚀 Starting deployment process..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="meeting-ai"
VERSION=$(grep "version.*=.*" app/main.py | grep -oP '"\K[^"]+' || echo "2.1.0")
REGISTRY="${REGISTRY:-docker.io}"
REPO="${REPO:-yourusername/meeting-ai}"

echo -e "${GREEN}Version: ${VERSION}${NC}"

# Step 1: Run tests
echo -e "\n${YELLOW}Running tests...${NC}"
pytest tests/ --cov=app --cov-report=term-missing || {
    echo -e "${RED}Tests failed! Aborting deployment.${NC}"
    exit 1
}

# Step 2: Build Docker image
echo -e "\n${YELLOW}Building Docker image...${NC}"
docker build -t ${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest .

# Step 3: Tag for registry
echo -e "\n${YELLOW}Tagging image for registry...${NC}"
docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${REPO}:${VERSION}
docker tag ${IMAGE_NAME}:latest ${REGISTRY}/${REPO}:latest

# Step 4: Push to registry (optional, uncomment to enable)
# echo -e "\n${YELLOW}Pushing to registry...${NC}"
# docker login ${REGISTRY}
# docker push ${REGISTRY}/${REPO}:${VERSION}
# docker push ${REGISTRY}/${REPO}:latest

# Step 5: Database migrations
echo -e "\n${YELLOW}Running database migrations...${NC}"
if [ -d "alembic/versions" ]; then
    alembic upgrade head || echo "No migrations to run"
fi

# Step 6: Build frontend
echo -e "\n${YELLOW}Building frontend...${NC}"
cd frontend
npm run build
cd ..

echo -e "\n${GREEN}✅ Deployment preparation complete!${NC}"
echo "Next steps:"
echo "  1. Push image to registry: docker push ${REGISTRY}/${REPO}:${VERSION}"
echo "  2. Deploy to your platform (Render, Fly.io, etc.)"
echo "  3. Set environment variables in your platform dashboard"
echo "  4. Scale workers as needed"
