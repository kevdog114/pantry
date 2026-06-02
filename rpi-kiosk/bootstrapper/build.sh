#!/bin/bash
# Build and push the bootstrapper image

IMAGE_NAME="klschaefer/pantry-bootstrapper:latest"
VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "0.0.0")
VERSION=${VERSION#v}
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "Building $IMAGE_NAME (version: $VERSION)..."
# Multi-platform build for standard PC and Raspberry Pi (arm64)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg VERSION="$VERSION" \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  -t $IMAGE_NAME \
  --push .
