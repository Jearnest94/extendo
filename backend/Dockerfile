# Docker file for the backend service
FROM python:3.12

# Install Google Chrome and other dependencies for Selenium/undetected-chromedriver
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    # Needed for Chrome
    libglib2.0-0 \
    libnss3 \
    libgconf-2-4 \
    libfontconfig1 \
    libx11-6 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    lsb-release \
    xdg-utils \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable

# Set the working directory
WORKDIR /app
# Copy the requirements file into the container
COPY requirements.txt .
# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install chromedriver (undetected-chromedriver might handle its own, but good to have system dependencies)
# RUN CHROME_DRIVER_VERSION=$(curl -sS https://chromedriver.storage.googleapis.com/LATEST_RELEASE_$(google-chrome --version | cut -d \" \" -f3 | cut -d. -f1)) \
#    && wget -N https://chromedriver.storage.googleapis.com/$CHROME_DRIVER_VERSION/chromedriver_linux64.zip -P ~/ \
#    && unzip ~/chromedriver_linux64.zip -d ~/ \
#    && rm ~/chromedriver_linux64.zip \
#    && mv -f ~/chromedriver /usr/local/bin/chromedriver \
#    && chmod +x /usr/local/bin/chromedriver

# Copy the rest of the application code into the container
COPY . .
# Expose the port the app runs on
EXPOSE 5000
# Set the environment variable for Flask
ENV FLASK_APP=app.main:create_app
# Set the environment variable for Flask to run in development mode
ENV FLASK_ENV=development
ENV FLASK_DEBUG=1   
# Run the application
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
# Use the following command to build the Docker image
# docker build -t backend:latest .
# Use the following command to run the Docker container
# docker run -p 5000:5000 backend:latest