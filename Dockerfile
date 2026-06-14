FROM python:3.13-slim

WORKDIR /app

# Copy python dependencies from the root if you have a root requirements.txt
# (If your requirements are inside the api folder, change this to COPY api/requirements.txt .)
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project layout into the container
COPY . .

# Explicitly expose the port your FastAPI/Flask API uses
EXPOSE 8000

# Default fallback command
CMD ["python", "main.py"]