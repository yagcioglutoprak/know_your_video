from youtube_transcript_api import YouTubeTranscriptApi
import re
from mistralai import Mistral
import os
import json
import requests
import time
from functools import wraps
import traceback


def rate_limit_with_retry(max_retries=3, delay=5):
    """Decorator to handle rate limiting with retries."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if "rate limit" in str(e).lower() and attempt < max_retries - 1:
                        print(f"Rate limit hit, retrying in {delay * (attempt + 1)} seconds...")
                        time.sleep(delay * (attempt + 1))  # Exponential backoff
                        continue
                    raise
            return func(*args, **kwargs)
        return wrapper
    return decorator

def extract_video_id(url):
    """Extract YouTube video ID from URL."""
    print(f"\nExtracting video ID from URL: {url}")
    pattern = r'(?:v=|\/)([0-9A-Za-z_-]{11}).*'
    match = re.search(pattern, url)
    if match:
        video_id = match.group(1)
        print(f"Extracted video ID: {video_id}")
        return video_id
    print("Could not extract video ID")
    return None


def get_video_info(url):
    """Get video title and description using YouTube Data API v3."""
    try:
        print(f"\nGetting video info for URL: {url}")
        video_id = extract_video_id(url)
        if not video_id:
            raise Exception("Invalid YouTube URL")

        # Use YouTube oEmbed API (doesn't require API key)
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        print(f"Fetching oEmbed data from: {oembed_url}")
        response = requests.get(oembed_url)
        
        if response.status_code != 200:
            print(f"Failed to fetch video info. Status code: {response.status_code}")
            print(f"Response: {response.text}")
            raise Exception("Failed to fetch video info")
            
        data = response.json()
        print(f"Successfully retrieved video info: {data}")
        
        return {
            'title': data.get('title', 'Unknown Title'),
            'description': data.get('author_name', 'No description available'),
            'thumbnail': data.get('thumbnail_url', f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg")
        }
    except Exception as e:
        print(f"Error in get_video_info: {str(e)}")
        print("Traceback:")
        print(traceback.format_exc())
        raise Exception(f"Error fetching video info: {str(e)}")


@rate_limit_with_retry(max_retries=3, delay=5)
def get_transcript(video_id):
    """Get video transcript with timestamps in the video's original language."""
    try:
        print(f"\nGetting transcript for video ID: {video_id}")
        
        # Get list of available transcripts
        print("Fetching available transcripts...")
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Try to find auto-generated transcript in video's language
        print("Looking for auto-generated transcript...")
        available_transcript = None
        
        for transcript_info in transcript_list:
            if transcript_info.is_generated:
                print(f"Found auto-generated transcript in {transcript_info.language_code}")
                available_transcript = transcript_info
                break
        
        if not available_transcript:
            print("No auto-generated transcripts found, looking for manual transcripts...")
            try:
                available_transcript = transcript_list.find_manually_created_transcript()
                print(f"Found manual transcript in {available_transcript.language_code}")
            except Exception as e:
                print(f"Error finding manual transcript: {str(e)}")
        
        if not available_transcript:
            print("No transcripts available for this video")
            raise Exception("No transcripts available for this video")
        
        # Get the transcript in original language
        print(f"Fetching transcript in {available_transcript.language_code}...")
        transcript = available_transcript.fetch()
        print(f"Successfully retrieved {len(transcript)} transcript segments")
        
        return transcript
        
    except Exception as e:
        print(f"Error in get_transcript: {str(e)}")
        print("Traceback:")
        print(traceback.format_exc())
        raise Exception(f"Error fetching transcript: {str(e)}")







def combine_transcript_segments(transcript, window_size=5):
    """Combine consecutive transcript segments into larger chunks for better context."""
    combined_segments = []
    i = 0
    while i < len(transcript):
        # Get a window of segments
        window = transcript[i:i + window_size]
        
        # Combine the text and timing information
        combined_text = ' '.join(seg['text'] for seg in window)
        start_time = window[0]['start']
        end_time = window[-1]['start'] + window[-1]['duration']
        
        combined_segments.append({
            'text': combined_text,
            'start': start_time,
            'duration': end_time - start_time
        })
        
        # Move the window forward
        i += window_size // 2  # Overlap windows to not miss context at boundaries
    
    return combined_segments


def analyze_with_llm(content, task, question=None):
    """Analyze content using Gemini model."""
    print(f"\nAnalyzing content with LLM for task: {task}")
    
    # Convert transcript segments into a single text with timestamps
    if isinstance(content, str) and task == 'fact_check':
        content = json.loads(content)
    
    formatted_text = ""
    if task == 'fact_check':
        # Process transcript in 2-minute chunks for better organization
        chunk_size = 120  # 2 minutes in seconds
        chunks = []
        current_chunk = []
        current_chunk_duration = 0
        
        # Split into chunks first
        for entry in content:
            if current_chunk_duration + entry['duration'] > chunk_size:
                chunks.append(current_chunk)
                current_chunk = [entry]
                current_chunk_duration = entry['duration']
            else:
                current_chunk.append(entry)
                current_chunk_duration += entry['duration']
        
        if current_chunk:
            chunks.append(current_chunk)
        
        # Format all chunks into one text
        for i, chunk in enumerate(chunks, 1):
            chunk_start = format_timestamp(chunk[0]['start'])
            chunk_end = format_timestamp(chunk[-1]['start'] + chunk[-1]['duration'])
            formatted_text += f"\nCHUNK {i} [{chunk_start} - {chunk_end}]:\n"
            
            for entry in chunk:
                timestamp = format_timestamp(entry['start'])
                end_timestamp = format_timestamp(entry['start'] + entry['duration'])
                formatted_text += f"[{timestamp}-{end_timestamp}] {entry['text']}\n"
        
        print(f"Split transcript into {len(chunks)} chunks")
        print(formatted_text)
    else:
        if isinstance(content, list):
            # Format transcript entries into readable text
            formatted_text = ' '.join([entry['text'] for entry in content])
        else:
            formatted_text = content
    
    print("Sending to LLM for analysis...")

    
    prompts = {
        'fact_check': """IMPORTANT: For every claim, you must choose one of these statuses:
- TRUE: Only if you can verify with 100% certainty using reliable sources
- FALSE: Only if you can prove it's incorrect using reliable sources
- SKIP: If you have ANY doubt or can't verify with 100% certainty

You are fact-checking the video transcript. The transcript is split into chunks for better organization, but analyze all of it for facts.

Your task is to:
1. Identify ALL factual claims that can be verified
2. Check each claim against reliable sources
3. Use the appropriate status:
   - TRUE: Only for 100% verified claims
   - FALSE: Only for claims you can prove are wrong
   - SKIP: For ANY claim you're not 100% certain about
4. Provide REAL references that actually exist (no fake or made-up sources)
5. Include claims with all three statuses (TRUE, FALSE, SKIP)
6. NEVER make up or hallucinate references
7. You can't know things that happened after your knowledge cutoff
8. When in doubt, always use SKIP

Acceptable sources (must be real and verifiable):
Academic journals and research papers
Government databases and reports
Official institutional records
Professional organization publications
Historical archives and documents
Educational institution databases
Industry standards and specifications
Patent and trademark databases
Professional conference proceedings
Verified institutional repositories

DO NOT USE:
- News websites
- Blog posts
- Social media
- Personal websites
- Entertainment sites
- Promotional materials

Example responses:
TRUE CLAIM: "The speed of light is approximately 299,792 kilometers per second"
   - TRUE: Can verify exactly with official sources
   - Reference: NIST Special Publication 330 (2019) - The International System of Units (SI)

FALSE CLAIM: "Humans only use 10% of their brains"
   - FALSE: Can prove this is wrong with scientific evidence
   - Reference: "Neuroscience: Exploring the Brain" (2015) by Bear, Connors, & Paradiso, ISBN: 978-0781778176

SKIP CLAIM: "This new technology will revolutionize the industry"
   - SKIP: Future prediction, cannot verify
   - Explanation: Claims about future impact cannot be verified with current data

SKIP CLAIM: "Sales increased by 50% last month"
   - SKIP: Recent event, may be after knowledge cutoff
   - Explanation: Cannot verify recent events without current data

Format your response as a JSON object:
{
    "results": [
        {
            "timestamp": "MM:SS",
            "timestamp_range": "MM:SS-MM:SS",
            "claim": "The exact claim from the video",
            "status": "TRUE/FALSE/SKIP",
            "explanation": "Clear explanation why this status was chosen",
            "references": [
                "Exact source with identifier (DOI, ISBN, etc.)",
                "Additional sources that verify the claim"
            ]
        }
    ]
}

CRITICAL RULES:
1. NEVER make up or hallucinate references
2. Include claims with all statuses (TRUE, FALSE, SKIP)
3. Use SKIP for ANY claim you're not 100% certain about
4. Always SKIP claims about:
   - Recent events (might be after knowledge cutoff)
   - Future predictions
   - Personal experiences
   - Unverifiable statistics
5. Check ALL chunks for facts, don't stop after the first one
6. Better to SKIP than to make a wrong TRUE/FALSE judgment""",
        'summarize': """Analyze the following video transcript and provide a summary in JSON format. Include both a brief overview and detailed sections.

Format your response as a JSON object with the following structure:
{
    "brief_overview": "A 2-3 sentence overview of the video content",
    "detailed_summary": {
        "introduction": "What the video starts with",
        "main_content": "The core content and arguments",
        "conclusion": "How the video ends and final takeaways"
    },
    "topics_covered": [
        "List of main topics",
        "covered in the video"
    ],
    "target_audience": "Who this video is most relevant for",
    "key_takeaways": [
        "Important point 1",
        "Important point 2"
    ]
}

Here's the transcript:""",
        'key_points': """Extract the main key points from this video transcript and format them as JSON. Include timestamps where available.

Format your response as a JSON object with the following structure:
{
    "main_points": [
        {
            "timestamp": "MM:SS",
            "point": "The key point made at this time",
            "details": "Additional context or explanation",
            "importance": "high/medium/low"
        }
    ],
    "themes": [
        "Overall theme 1",
        "Overall theme 2"
    ],
    "arguments": [
        {
            "claim": "Main argument made",
            "supporting_points": [
                "Supporting point 1",
                "Supporting point 2"
            ]
        }
    ]
}

Here's the transcript:""",
        'question': "Based on this video transcript, please answer the following question:"
    }
    
    try:
        # Prepare the request to Gemini API
        api_key = os.getenv('GEMINI_API_KEY')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={api_key}"
        
        headers = {
            'Content-Type': 'application/json'
        }
        
        # Format the prompt based on task
        if task == 'question':
            prompt = f"{prompts[task]} {question}\n\n{formatted_text}"
        else:
            prompt = f"{prompts[task]}\n\n{formatted_text}"
        
        data = {
            "contents": [{
                "parts":[{
                    "text": prompt
                }]
            }]
        }
        
        print(f"\nSending request to LLM for task: {task}")
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        
        # Extract the response
        result = response.json()
        print(f"Raw API Response: {result}")
        
        if 'candidates' in result and len(result['candidates']) > 0:
            candidate = result['candidates'][0]
            
            # Handle different response structures
            if 'content' in candidate and 'parts' in candidate['content']:
                response_text = candidate['content']['parts'][0]['text']
            elif 'text' in candidate:
                response_text = candidate['text']
            else:
                print(f"Unexpected response structure: {candidate}")
                return None
            
            # Remove markdown code block markers if present
            response_text = response_text.replace('```json\n', '').replace('\n```', '').strip()
            print(f"Extracted response text: {response_text[:200]}...")  # Print first 200 chars
            
            # For fact-checking and structured responses, ensure we have valid JSON
            if task in ['fact_check', 'summarize', 'key_points']:
                try:
                    json_data = json.loads(response_text)
                    if task == 'fact_check' and 'results' not in json_data:
                        json_data = {'results': []}
                    return json_data
                except json.JSONDecodeError as e:
                    print(f"JSON decode error: {str(e)}")
                    if task == 'fact_check':
                        return {'results': []}
                    return None
            
            return response_text
        else:
            print("No candidates found in response")
            return None
            
    except Exception as e:
        print(f"Error analyzing content with LLM: {str(e)}")
        print("Traceback:")
        print(traceback.format_exc())
        return None
def format_timestamp(seconds):
    """Convert seconds to MM:SS format."""
    
    minutes = int(seconds // 60)
    seconds = int(seconds % 60)
    timestamp = f"{minutes:02d}:{seconds:02d}"

    return timestamp

def process_transcript_with_fact_check(transcript, fact_check_results):
    """Process transcript entries with fact-check results."""
    if not fact_check_results:
        return transcript
        
    # Create a map of timestamps to fact-check results
    fact_check_map = {}
    for result in fact_check_results.get('results', []):
        # Store by both single timestamp and range
        timestamp = result['timestamp']
        timestamp_range = result['timestamp_range']
        fact_check_map[timestamp] = result
        fact_check_map[timestamp_range] = result
    
    # Process each transcript entry
    annotated_transcript = []
    for entry in transcript:
        timestamp = format_timestamp(entry['start'])
        end_timestamp = format_timestamp(entry['start'] + entry['duration'])
        timestamp_range = f"{timestamp}-{end_timestamp}"
        
        # Try to find fact check by either single timestamp or range
        fact_check = fact_check_map.get(timestamp) or fact_check_map.get(timestamp_range)
        
        annotated_entry = {
            'text': entry['text'],
            'timestamp': timestamp,
            'timestamp_range': timestamp_range,
            'start': entry['start'],
            'duration': entry['duration'],
            'fact_check': None
        }
        
        if fact_check:
            annotated_entry['fact_check'] = {
                'claim': fact_check['claim'],
                'status': fact_check['status'],
                'explanation': fact_check['explanation'],
                'references': fact_check['references'],
                'timestamp': fact_check['timestamp'],
                'timestamp_range': fact_check['timestamp_range']
            }
        
        annotated_transcript.append(annotated_entry)
    
    return annotated_transcript        


