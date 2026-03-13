# Use official Python base image
FROM python:3.10-slim

# Set working directory inside the container
WORKDIR /app

# Install build tools and CMake
RUN apt-get update && apt-get install -y \
    cmake \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements.txt file into the container
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --default-timeout=100 --no-cache-dir -r requirements.txt

# Copy all backend source code into the container
COPY . .

# Expose the port FastAPI will run on
EXPOSE 8000

# Command to run the FastAPI app with hot reload
# This allows Railway to inject the dynamic $PORT
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload
