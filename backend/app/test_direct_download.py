\
import os
import shutil
import tempfile
import requests
import logging
import zstandard
from awpy import Demo
from dotenv import load_dotenv

# Configure logger for this test script
logger = logging.getLogger(__name__)

def parse_demo_directly_with_key(cloud_resource_url: str, api_key: str) -> dict:
    # Attempts to download a demo file directly using a given API key as a Bearer token,
    # decompresses if it's a .zst file, parses it using awpy, and returns extracted data.

    temp_dir = None
    try:
        logger.info(f"Attempting direct download for: {cloud_resource_url}")
        
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        logger.info(f"Using Authorization header for direct GET: Bearer {api_key[:10]}... (truncated)")

        # Create a temporary directory to store the demo file
        temp_dir = tempfile.mkdtemp()
        original_demo_file_name = os.path.basename(cloud_resource_url.split("?")[0])
        local_demo_path = os.path.join(temp_dir, original_demo_file_name)
        dem_file_to_parse = local_demo_path

        logger.info(f"Downloading to temporary path: {local_demo_path}")
        response_demo_download = requests.get(cloud_resource_url, headers=headers, stream=True)
        response_demo_download.raise_for_status()  # Raise an exception for bad status codes

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
        logger.error(f"HTTP error during direct download: {http_err} - Status: {http_err.response.status_code}")
        try:
            logger.error(f"Response Body: {http_err.response.text}") # Log text for non-JSON response
            return {"error": f"Failed to download demo (HTTP {http_err.response.status_code}): {http_err.response.text}"}
        except Exception: # Fallback if .text also fails or if response is too complex
             return {"error": f"Failed to download demo (HTTP {http_err.response.status_code})"}
    except requests.exceptions.RequestException as e:
        logger.error(f"Error downloading demo file directly: {e}")
        return {"error": f"Failed to download demo: {e}"}
    except Exception as e:
        logger.error(f"Error parsing demo file: {e}", exc_info=True)
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
        logger.info(f"Faceit Matches API response: {match_data}")
        
        demo_urls = match_data.get("demo_url")
        if demo_urls and len(demo_urls) > 0:
            cloud_resource_demo_link = demo_urls[0]
            logger.info(f"Found cloud resource demo URL: {cloud_resource_demo_link}")

            if "faceit-cdn.net" in cloud_resource_demo_link or ".dem" in cloud_resource_demo_link or ".zst" in cloud_resource_demo_link:
                logger.info(f"Attempting direct demo parse for URL: {cloud_resource_demo_link}")
                parsed_info = parse_demo_directly_with_key(cloud_resource_demo_link, faceit_api_key)

                if "error" in parsed_info:
                    print(f"Error parsing demo: {parsed_info['error']}")
                else:
                    print("Demo Parsed Successfully (Direct Download Test):")
                    header = parsed_info.get("header", {})
                    print(f"  Map: {header.get('map_name')}")
                    print(f"  Server: {header.get('server_name')}")
                    print(f"  Client: {header.get('client_name')}")
                    print(f"  Header Keys: {list(header.keys())}")
            else:
                warning_msg = f"Extracted URL does not look like a demo link: {cloud_resource_demo_link}"
                logger.warning(warning_msg)
                print(warning_msg)
        else:
            logger.warning(f"No demo URL found for match_id: {match_id}. Response: {match_data}")
            print(f"No demo URL found for match_id: {match_id}")
            if "message" in match_data:
                 print(f"API response message: {match_data.get('message')}")

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
