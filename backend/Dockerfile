# Docker file for the backend service
FROM python:3.12
# Set the working directory
WORKDIR /app
# Copy the requirements file into the container
COPY requirements.txt .
# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt
# Copy the rest of the application code into the container
COPY . .
# Expose the port the app runs on
EXPOSE 8000
# Set the environment variable for Flask
ENV FLASK_APP=app.main:create_app
# Set the environment variable for Flask to run in development mode
ENV FLASK_ENV=development
# Run the application
CMD ["flask", "run", "--host=0.0.0.0", "--port=8000"]
# Use the following command to build the Docker image
# docker build -t backend:latest .
# Use the following command to run the Docker container
# docker run -p 8000:8000 backend:latest