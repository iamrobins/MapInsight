import json, os, time
import http.client
from openai import OpenAI
from pymongo import MongoClient
from datetime import datetime

from .parser import parse_review_summary

client = MongoClient(os.getenv("MONGO_URI"))

# Access the database
db = client["MapInsight"]

# Access collections
job_status_collection = db["jobStatus"]
places_collection = db["places"]

# Check if TTL index already exists
def ensure_ttl_index(collection, field_name, expire_seconds):
    indexes = collection.index_information()
    ttl_index_exists = any(
        idx.get('expireAfterSeconds') == expire_seconds and field_name in idx['key'][0]
        for idx in indexes.values()
    )
    if not ttl_index_exists:
        print(f"Creating TTL index on {field_name} with expiration of {expire_seconds} seconds.")
        collection.create_index(
            [(field_name, 1)],
            expireAfterSeconds=expire_seconds
        )
    else:
        print("TTL index already exists.")

# Ensure TTL index on the 'createdAt' field
ensure_ttl_index(job_status_collection, "createdAt", 600)

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

def summarize_reviews(place_details):
    """
    Summarize reviews using the OpenAI GPT API.
    """
    if os.getenv('ENVIRONMENT') == "development":
        
        parsed_summary = parse_review_summary("**Summary for Sticks'n'Sushi Covent Garden**\n\n**Key Positive Points:**\n- High-quality food with fresh and flavorful ingredients.\n- Sushi platter is beautifully presented and well-received by customers.\n- The sticks, particularly the duck, are highlighted as exceptionally tasty.\n- Some customers praised the service as fantastic, particularly noting attentive staff who accommodated special dietary needs.\n- Consistent quality in food across different locations, with some new and innovative menu items appreciated.\n\n**Key Negative Points:**\n- Service issues are a common complaint, with many reviews noting inattentive or disengaged staff.\n- Long wait times for order taking, refills, and bill processing.\n- Some customers found the sushi to be average and not as impressive as expected.\n- High prices are mentioned, with desserts described as average and not worth trying.\n\n**Overall Impression:**\nSticks'n'Sushi Covent Garden offers excellent food with fresh and flavorful options, particularly praised for their sushi and sticks. However, the location struggles with service consistency, leading to a mixed dining experience. While some guests enjoy attentive service and innovative dishes, others report significant service lapses that detract from the overall experience. The location may appeal to those prioritizing food quality but could disappoint those seeking attentive service.")
        return parsed_summary
    
    place_name = place_details.get('placeName', 'Unknown Place')
    reviews = place_details.get('reviews', [])
    
    if not reviews:
        print("No reviews found for the place.")
        return None
    
    # Extract review texts
    review_texts = [review['text'] for review in reviews]

    # Create a prompt for the GPT model
    prompt = (
        f"Summarize the following reviews for {place_name}. "
        "Include key positive points, key negative points, and an overall impression.\n\n"
        "Reviews:\n" + "\n".join(review_texts)
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant specialized in summarizing reviews for various locations. "
                    "Your task is to analyze customer reviews and provide a structured summary. "
                    "Each summary should include: \n"
                    "1. Key positive points that customers appreciate. \n"
                    "2. Key negative points or common complaints. \n"
                    "3. An overall impression of the place based on the reviews. \n"
                    "Ensure the summary is concise, objective, and uses bullet points for clarity. "
                    "Do not add personal opinions or external information. "
                    "Focus on extracting sentiments and insights from the given reviews."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.5,
        max_tokens=256,
        top_p=1,
        n=1,
        frequency_penalty=0,
        presence_penalty=0
    )

    # Extract the summary from the response
    summary = response.choices[0].message.content.strip()
    
    

    return summary

def start(body, ch):
    data = json.loads(body)
    places = data["data"]
    summaries = []
    places_ref_ids = []

    for place in places:
        place_exists = places_collection.find_one({"id": place["id"]})
        if place_exists:
            summaries.append(place_exists["summary"])
            # places_ref_ids.append({"$ref": "places", "$id": place_exists["id"]})
            places_ref_ids.append(place_exists["id"])
        else:
            summary = summarize_reviews(place)
            place["summary"] = parse_review_summary(summary)
            places_ref_ids.append(place["id"])
            places_collection.insert_one(place)
            summaries.append(summary)

    job_status_doc = {
        "jobId": data["jobId"],
        "status": "complete",
        "placeIds": places_ref_ids,
        "createdAt": datetime.utcnow()  # Required for TTL
    }
    
    job_status_collection.insert_one(job_status_doc)

    url = os.getenv("NOTIFICATION_URL")
    endpoint = "/update-status"
    payload = json.dumps({
        "jobId": data["jobId"],
        "status": "complete",
        "places": places_ref_ids
    })
    headers = {
        "Content-Type": "application/json"
    }

    conn = http.client.HTTPConnection(url)
    
    max_retries = 5
    retry_interval = 1  # Start with 1 second
    
    for attempt in range(max_retries):
        try:
            conn.request("POST", endpoint, payload, headers)
            response = conn.getresponse()
            if response.status != 200:
                raise Exception(f"HTTP error: {response.status} {response.reason}")
            response_data = response.read().decode()
            print(f"Response: {response_data}")
            if response.status == 200:
                break
        except Exception as e:
            print(f"Request failed: {e}. Attempt {attempt + 1} of {max_retries}.")
            time.sleep(retry_interval)
            retry_interval *= 2  # Exponential backoff
        finally:
            conn.close()