\
import os
import shutil
import tempfile
import requests
import logging
import zstandard
import cloudscraper # Added cloudscraper
from awpy import Demo
from dotenv import load_dotenv

# Configure logger for this test script
logger = logging.getLogger(__name__)

# Updated endpoint based on Leetify extension
FACEIT_DOWNLOAD_URL_API_ENDPOINT = "https://www.faceit.com/api/download/v2/demos/download-url"

def get_signed_url(resource_url: str, api_key: str, captcha_token: str | None = None) -> str: # Added captcha_token parameter
    """Gets a signed URL for a Faceit resource."""
    endpoint = "https://www.faceit.com/api/download/v2/demos/download-url"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {"resource_url": resource_url}
    if captcha_token:
        payload["captcha_token"] = captcha_token
    
    logger.info(f"Requesting signed URL with payload: {payload} and headers: Bearer {api_key[:10]}...")
    
    # Use cloudscraper for this request as well
    scraper = cloudscraper.create_scraper()
    response = scraper.post(endpoint, headers=headers, json=payload)

    if response.status_code == 403:
        logger.error(f"HTTP error: {response.status_code} {response.reason} for url: {response.url} - Status: {response.status_code}")
        logger.error(f"Response Body (text): {response.text}")
        raise requests.exceptions.HTTPError(f"HTTP error: {response.status_code} {response.reason} for url: {response.url}", response=response)
    response.raise_for_status()
    return response.json().get("payload")

def parse_demo_via_download_api(cloud_resource_url: str, api_key: str) -> dict:
    """
    Fetches a signed demo URL from Faceit's download-url API,
    then downloads the demo, decompresses if .zst, parses, and returns data.
    """
    temp_dir = None
    actual_download_url = None
    download_request_headers = {} # Typically empty for signed URLs

    try:
        logger.info(f"Attempting to get signed URL for: {cloud_resource_url} using endpoint: {FACEIT_DOWNLOAD_URL_API_ENDPOINT}")
        
        # TODO: Implement a way to get a valid captcha_token
        # For now, we'll pass None, which will likely still result in an error,
        # but the function signature now reflects the need.
        placeholder_captcha_token = None 
        logger.info(f"Attempting to get signed URL with placeholder captcha token: {placeholder_captcha_token}")
        signed_url_data = get_signed_url(cloud_resource_url, api_key, placeholder_captcha_token)
        actual_download_url = signed_url_data.get("payload", {}).get("download_url")
        if not actual_download_url:
            error_msg = "Could not extract signed download URL from Faceit Download URL API response."
            logger.error(error_msg)
            logger.error(f"Full response: {signed_url_data}")
            return {"error": error_msg, "details": signed_url_data}
            
        logger.info(f"Obtained signed download URL: {actual_download_url}")

        # Now, download the demo from the actual_download_url
        logger.info(f"Attempting to download demo from signed URL: {actual_download_url}")
        
        temp_dir = tempfile.mkdtemp()
        # Use the original demo file name from the cloud_resource_url for saving, not from the signed URL
        original_demo_file_name = os.path.basename(cloud_resource_url.split("?")[0])
        local_demo_path = os.path.join(temp_dir, original_demo_file_name)
        dem_file_to_parse = local_demo_path

        logger.info(f"Downloading to temporary path: {local_demo_path}")
        # Signed URLs usually don't need authorization headers for the GET request
        
        # Use cloudscraper to bypass Cloudflare
        scraper = cloudscraper.create_scraper()
        response_demo_download = scraper.get(actual_download_url, headers=download_request_headers, stream=True)
        response_demo_download.raise_for_status()

        with open(local_demo_path, "wb") as f:
            for chunk in response_demo_download.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info(f"Successfully downloaded demo: {local_demo_path}")

        # Check if the file is Zstandard compressed
        if original_demo_file_name.endswith(".zst"):
            logger.info(f"Detected .zst extension. Decompressing {local_demo_path}")
            decompressed_dem_name = original_demo_file_name[:-4] # Remove .zst
            if not decompressed_dem_name.endswith(".dem"):
                decompressed_dem_name += ".dem" # Ensure it has .dem extension
            
            decompressed_dem_path = os.path.join(temp_dir, decompressed_dem_name)
            
            dctx = zstandard.ZstdDecompressor()
            with open(local_demo_path, 'rb') as ifh, open(decompressed_dem_path, 'wb') as ofh:
                dctx.copy_stream(ifh, ofh)
            
            logger.info(f"Successfully decompressed to: {decompressed_dem_path}")
            dem_file_to_parse = decompressed_dem_path
        elif not original_demo_file_name.endswith(".dem"):
            logger.warning(f"Downloaded file {original_demo_file_name} is not a .dem or .zst file. Attempting to parse anyway.")

        logger.info(f"Initializing Demo parser for: {dem_file_to_parse}")
        demo_parser = Demo(demofile=dem_file_to_parse)
        
        logger.info(f"Parsing demo file...")
        parsed_data = demo_parser.parse()
        logger.info(f"Successfully parsed demo file.")
        return parsed_data

    except requests.exceptions.HTTPError as http_err:
        # This can be from either the POST to get the signed URL or the GET to download the demo
        logger.error(f"HTTP error: {http_err} - Status: {http_err.response.status_code}")
        response_text = ""
        try:
            # Try to log JSON if possible, otherwise text
            response_json = http_err.response.json()
            logger.error(f"Response Body (JSON): {response_json}")
            response_text = str(response_json)
        except ValueError: # If response is not JSON
            response_text = http_err.response.text
            logger.error(f"Response Body (text): {response_text}")
        return {"error": f"HTTP error ({http_err.response.status_code}) during API call or download: {response_text}"}
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error (e.g., DNS failure, connection error): {e}")
        return {"error": f"Request error: {e}"}
    except Exception as e:
        logger.error(f"An unexpected error occurred in parse_demo_via_download_api: {e}", exc_info=True)
        return {"error": f"Failed to parse demo: {type(e).__name__} - {e}"}
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"Successfully removed temporary directory: {temp_dir}")
            except Exception as e:
                logger.error(f"Error removing temporary directory {temp_dir}: {e}")

def run_direct_download_test():
    match_id = "1-42b32355-04d4-44e1-9bad-86b6ae56f34e" # Example match_id
    faceit_api_key = os.getenv("FACEIT_API_KEY")

    if not faceit_api_key:
        print("Error: FACEIT_API_KEY environment variable not found.")
        logger.error("FACEIT_API_KEY environment variable not found.")
        return

    # Fetch match details to get the demo_url (cloud resource URL)
    matches_api_url = f"https://open.faceit.com/data/v4/matches/{match_id}"
    matches_api_headers = {
        "Authorization": f"Bearer {faceit_api_key}",
        "Accept": "application/json"
    }

    logger.info(f"Fetching match details from FACEIT Matches API for match_id: {match_id}")
    try:
        response = requests.get(matches_api_url, headers=matches_api_headers)
        response.raise_for_status()
        match_data = response.json()
        # logger.info(f"Faceit Matches API response: {match_data}") # Can be very verbose
        
        demo_urls = match_data.get("demo_url")
        if demo_urls and len(demo_urls) > 0:
            cloud_resource_demo_link = demo_urls[0]
            logger.info(f"Found cloud resource demo URL: {cloud_resource_demo_link}")

            if "faceit-cdn.net" in cloud_resource_demo_link or ".dem" in cloud_resource_demo_link or ".zst" in cloud_resource_demo_link:
                logger.info(f"Attempting demo parse for URL: {cloud_resource_demo_link} using the download API method.")
                # Call the updated function
                parsed_info = parse_demo_via_download_api(cloud_resource_demo_link, faceit_api_key)

                if "error" in parsed_info:
                    print(f"Error parsing demo: {parsed_info['error']}")
                    if "details" in parsed_info:
                        print(f"Error details: {parsed_info['details']}")
                else:
                    print("Demo Parsed Successfully (Using Download URL API Test):")
                    header = parsed_info.get("header", {})
                    print(f"  Map: {header.get('map_name')}")
                    print(f"  Server: {header.get('server_name')}")
                    print(f"  Client: {header.get('client_name')}")
                    # print(f"  Header Keys: {list(header.keys())}") # Useful for debugging
            else:
                warning_msg = f"Extracted URL does not look like a demo link: {cloud_resource_demo_link}"
                logger.warning(warning_msg)
                print(warning_msg)
        else:
            logger.warning(f"No demo URL found for match_id: {match_id}. Response: {match_data.get('message', 'No message in response.')}")
            print(f"No demo URL found for match_id: {match_id}")
            if "message" in match_data:
                 print(f"API response message: {match_data.get('message')}")
            elif "errors" in match_data:
                 print(f"API error details: {match_data.get('errors')}")


    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error fetching match details from FACEIT Matches API: {http_err}")
        logger.error(f"API Response Status: {http_err.response.status_code}")
        try:
            logger.error(f"API Response Body: {http_err.response.json()}")
            print(f"HTTP error: {http_err} - Status: {http_err.response.status_code} - Body: {http_err.response.json()}")
        except ValueError: # If response is not JSON
            logger.error(f"API Response Body: {http_err.response.text}")
            print(f"HTTP error: {http_err} - Status: {http_err.response.status_code} - Body: {http_err.response.text}")
    except requests.exceptions.RequestException as req_err:
        logger.error(f"Request error fetching match details from FACEIT Matches API: {req_err}")
        print(f"Request error: {req_err}")
    except Exception as e:
        logger.error(f"An unexpected error occurred in run_direct_download_test: {e}", exc_info=True)
        print(f"An unexpected error occurred: {e}")

if __name__ == '__main__':
    load_dotenv() # Load .env file for FACEIT_API_KEY

    logging.basicConfig(level=logging.INFO, 
                        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                        handlers=[logging.StreamHandler()])
    
    # Optionally set higher level for noisy libraries
    # logging.getLogger("requests").setLevel(logging.WARNING)
    # logging.getLogger("urllib3").setLevel(logging.WARNING)
    
    run_direct_download_test()
