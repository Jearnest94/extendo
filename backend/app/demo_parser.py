import os
import shutil
import tempfile
import requests
import logging
import zstandard # Add zstandard import
from awpy import Demo # Changed from from awpy.parser import DemoParser

logger = logging.getLogger(__name__)

# Define the Faceit Downloads API endpoint
# The base URL (https://open.faceit.com) is assumed based on other Faceit APIs.
# The documentation only provides the path: /download/v2/demos/download
FACEIT_DOWNLOADS_API_ENDPOINT = "https://open.faceit.com/download/v2/demos/download"

def parse_demo_from_url(cloud_resource_url: str, faceit_download_api_key: str) -> dict:
    """
    Fetches a signed download URL from the Faceit Downloads API,
    downloads a demo file, decompresses if it's a .zst file,
    parses it using awpy, and returns extracted data or an error message.
    """
    temp_dir = None # Initialize temp_dir to ensure it's available in finally
    try:
        logger.info(f"Received cloud resource URL: {cloud_resource_url}")

        # Step 1: Get the signed download URL from Faceit Downloads API
        logger.info(f"Fetching signed download URL for: {cloud_resource_url}")
        headers = {
            "Authorization": f"Bearer {faceit_download_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "resource_url": cloud_resource_url
        }
        
        try:
            response_download_api = requests.post(FACEIT_DOWNLOADS_API_ENDPOINT, headers=headers, json=payload)
            response_download_api.raise_for_status() # Raise an exception for bad status codes
            signed_url_data = response_download_api.json()
            logger.info(f"Faceit Downloads API response: {signed_url_data}")
            
            signed_download_url = signed_url_data.get("payload", {}).get("download_url")
            if not signed_download_url:
                error_msg = "Could not extract signed download URL from Faceit Downloads API response."
                logger.error(error_msg)
                return {"error": error_msg}
            
            logger.info(f"Obtained signed download URL: {signed_download_url}")

        except requests.exceptions.HTTPError as http_err:
            error_msg = f"HTTP error fetching signed URL from Faceit Downloads API: {http_err} - Status: {http_err.response.status_code} - Body: {http_err.response.text}"
            logger.error(error_msg)
            return {"error": error_msg}
        except requests.exceptions.RequestException as req_err:
            error_msg = f"Request error fetching signed URL from Faceit Downloads API: {req_err}"
            logger.error(error_msg)
            return {"error": error_msg}
        except ValueError as json_err: # Catch JSON decoding errors
            error_msg = f"Error decoding JSON response from Faceit Downloads API: {json_err}"
            logger.error(error_msg)
            return {"error": error_msg}

        # Step 2: Download the demo using the signed URL
        logger.info(f"Attempting to download demo from signed URL: {signed_download_url}")
        
        temp_dir = tempfile.mkdtemp()
        # Use the original cloud_resource_url to determine the filename, as the signed URL might be opaque
        original_demo_file_name = os.path.basename(cloud_resource_url.split("?")[0])
        local_demo_path = os.path.join(temp_dir, original_demo_file_name)
        dem_file_to_parse = local_demo_path

        logger.info(f"Downloading to temporary path: {local_demo_path}")
        # Use the signed_download_url for the actual download
        response_demo_download = requests.get(signed_download_url, stream=True)
        response_demo_download.raise_for_status()

        with open(local_demo_path, "wb") as f:
            for chunk in response_demo_download.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info(f"Successfully downloaded demo: {local_demo_path}")

        # Step 3: Decompress and Parse (existing logic)
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
            dem_file_to_parse = decompressed_dem_path # Update path to the decompressed file
        elif not original_demo_file_name.endswith(".dem"):
            logger.warning(f"Downloaded file {original_demo_file_name} is not a .dem or .zst file. Attempting to parse anyway.")


        # Initialize the DemoParser with the path to the demo file
        # Note: The awpy library expects a 'demofile' argument for the Demo class constructor.
        logger.info(f"Initializing DemoParser for: {dem_file_to_parse}")
        demo_parser = Demo(demofile=dem_file_to_parse) # Changed DemoParser to Demo and added demofile=
        
        # Parse the demo file to extract data. 
        # The parse() method is called on the instance.
        # According to awpy docs, this returns a dictionary of parsed data.
        logger.info(f"Parsing demo file...")
        parsed_data = demo_parser.parse() # Changed to call parse() method
        logger.info(f"Successfully parsed demo file.")

        # Example: Accessing specific data (if available and needed)
        # header_data = parsed_data.get("header", {})
        # rounds_data = parsed_data.get("rounds", [])
        # kills_data = parsed_data.get("kills", [])

        # For now, returning the whole parsed data dictionary
        return parsed_data

    except requests.exceptions.RequestException as e:
        # This will catch errors from the demo download itself (using signed_download_url)
        logger.error(f"Error downloading demo file using signed URL: {e}")
        return {"error": f"Failed to download demo using signed URL: {e}"}
    except Exception as e:
        # Catching a broader range of exceptions during parsing
        logger.error(f"Error parsing demo file: {e}")
        # Include the type of exception for better debugging
        return {"error": f"Failed to parse demo: {type(e).__name__} - {e}"}
    finally:
        # Clean up: Remove the temporary directory and its contents
        if temp_dir and os.path.exists(temp_dir): # Check if temp_dir was created
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"Successfully removed temporary directory: {temp_dir}")
            except Exception as e:
                logger.error(f"Error removing temporary directory {temp_dir}: {e}")

def example_usage():
    match_id = "1-42b32355-04d4-44e1-9bad-86b6ae56f34e" # Changed match_id
    # This API key is used for the Faceit Data API (to get match details)
    # and will also be passed to parse_demo_from_url for the Downloads API.
    # IMPORTANT: The Downloads API might require a separate key/token with specific scopes.
    faceit_api_key = os.getenv("FACEIT_API_KEY")

    if not faceit_api_key:
        print("Error: FACEIT_API_KEY environment variable not found.")
        logger.error("FACEIT_API_KEY environment variable not found.")
        return

    api_url = f"https://open.faceit.com/data/v4/matches/{match_id}"
    headers = {
        "Authorization": f"Bearer {faceit_api_key}",
        "Accept": "application/json"
    }

    logger.info(f"Fetching match details from FACEIT API for match_id: {match_id}")
    try:
        response = requests.get(api_url, headers=headers)
        response.raise_for_status()  # Raise an exception for bad status codes
        match_data = response.json()
        logger.info(f"Faceit API response for match_id {match_id}: {match_data}") # Log the full API response
        
        demo_urls = match_data.get("demo_url")
        if demo_urls and len(demo_urls) > 0:
            cloud_resource_demo_link = demo_urls[0] # This is the cloud resource URL
            logger.info(f"Found cloud resource demo URL: {cloud_resource_demo_link}")

            # Basic check if the link seems like a demo file (using the cloud resource link for this check)
            if "faceit-cdn.net" in cloud_resource_demo_link or ".dem" in cloud_resource_demo_link or ".zst" in cloud_resource_demo_link:
                # Pass the cloud_resource_demo_link and the api_key to the updated function
                parsed_info = parse_demo_from_url(cloud_resource_demo_link, faceit_api_key)
                if "error" in parsed_info:
                    # Error is already logged by parse_demo_from_url
                    print(f"Error parsing demo: {parsed_info['error']}")
                else:
                    print("Demo Parsed Successfully:")
                    header = parsed_info.get("header", {})
                    print(f"  Map: {header.get('map_name')}")
                    print(f"  Server: {header.get('server_name')}")
                    print(f"  Client: {header.get('client_name')}")
                    # print(f"  Rounds: {len(parsed_info.get('rounds', []))}") # Example of other data
                    # print(f"  Kills: {len(parsed_info.get('kills', []))}")   # Example of other data
                    print(f"  Header Keys: {list(header.keys())}")
            else:
                logger.warning(f"Extracted URL does not look like a demo link: {cloud_resource_demo_link}")
                print(f"Extracted URL does not look like a demo link: {cloud_resource_demo_link}")
        else:
            logger.warning(f"No demo URL found for match_id: {match_id}. Response: {match_data}")
            print(f"No demo URL found for match_id: {match_id}")
            if "message" in match_data:
                 print(f"API response message: {match_data.get('message')}")


    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error fetching match details from FACEIT API: {http_err}")
        logger.error(f"API Response Status: {http_err.response.status_code}")
        try:
            logger.error(f"API Response Body: {http_err.response.json()}")
            print(f"HTTP error: {http_err} - Status: {http_err.response.status_code} - Body: {http_err.response.json()}")
        except ValueError:
            logger.error(f"API Response Body: {http_err.response.text}")
            print(f"HTTP error: {http_err} - Status: {http_err.response.status_code} - Body: {http_err.response.text}")
    except requests.exceptions.RequestException as req_err:
        logger.error(f"Request error fetching match details from FACEIT API: {req_err}")
        print(f"Request error: {req_err}")
    except Exception as e:
        logger.error(f"An unexpected error occurred in example_usage: {e}", exc_info=True)
        print(f"An unexpected error occurred: {e}")

if __name__ == '__main__':
    from dotenv import load_dotenv # Add this line
    load_dotenv() # Add this line to load .env file

    # Configure basic logging for standalone testing
    # This will show logs from this script as well as from the parse_demo_from_url function
    logging.basicConfig(level=logging.INFO, 
                        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                        handlers=[logging.StreamHandler()]) # Ensure logs go to console
    
    # Optionally set higher level for noisy libraries if they are too verbose
    # logging.getLogger("requests").setLevel(logging.WARNING)
    # logging.getLogger("urllib3").setLevel(logging.WARNING)
    
    example_usage()
