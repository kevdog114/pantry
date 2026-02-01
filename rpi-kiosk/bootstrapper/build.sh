#!/bin/bash
# Build and push the bootstrapper image

IMAGE_NAME="klschaefer/pantry-bootstrapper:latest"

echo "Building $IMAGE_NAME..."
# Multi-platform build for standard PC and Raspberry Pi (arm64)
docker buildx build --platform linux/amd64,linux/arm64 -t $IMAGE_NAME --push .
