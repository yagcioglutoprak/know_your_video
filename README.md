# YouTube Video Analysis API

An intelligent platform for analyzing YouTube videos using LLM technology. The API provides video transcription, summarization, fact-checking with references, and interactive Q&A capabilities.

## Setup

1. Clone the repository
2. Create a `.env` file based on `.env.example` and add your OpenAI API key
3. Install the required dependencies:
```bash
pip install -r requirements.txt
```

4. Run the application:
```bash
python app.py
```

The API will be available at `http://127.0.0.1:5000/`

## API Endpoints

### 1. Analyze Video
- **Endpoint**: `/api/analyze`
- **Method**: POST
- **Body**:
```json
{
    "video_url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```
- **Response**: Returns:
  - Video information (title, description, thumbnail)
  - Annotated transcript with fact-checking
  - Summary
  - Fact-check results with references
  - Key points

### 2. Get Transcript
- **Endpoint**: `/api/transcript`
- **Method**: GET
- **Query Parameters**: `video_url=https://www.youtube.com/watch?v=VIDEO_ID`
- **Response**: Returns the video transcript with timestamps and fact-checking annotations.

### 3. Ask Question
- **Endpoint**: `/api/question`
- **Method**: POST
- **Body**:
```json
{
    "video_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "question": "Your question about the video content"
}
```
- **Response**: Returns an AI-generated answer based on the video content.

## Fact-Checking Format

The API provides detailed fact-checking information in the following format:

```json
{
    "transcript": [
        {
            "text": "Original transcript text",
            "timestamp": "MM:SS",
            "start": 123.45,
            "duration": 3.0,
            "fact_check": {
                "is_true": true/false,
                "explanation": "Explanation of why the statement is true or false",
                "references": [
                    "Reference 1",
                    "Reference 2"
                ],
                "correction": "Correct information (only for false claims)"
            }
        }
    ]
}
```

For frontend display:
- Statements marked as `is_true: true` can be displayed in green with supporting references
- Statements marked as `is_true: false` should be displayed in red with corrections and references
- Hover or click interactions can show the detailed explanation and references

## Example Usage

```python
import requests

# Analyze a video
response = requests.post('http://localhost:5000/api/analyze', 
    json={'video_url': 'https://www.youtube.com/watch?v=VIDEO_ID'})
result = response.json()

# Access fact-checked transcript
transcript = result['transcript']
for entry in transcript:
    if entry['fact_check']:
        print(f"Statement: {entry['text']}")
        print(f"Is True: {entry['fact_check']['is_true']}")
        print(f"Explanation: {entry['fact_check']['explanation']}")
        print(f"References: {', '.join(entry['fact_check']['references'])}")
        if not entry['fact_check']['is_true']:
            print(f"Correction: {entry['fact_check']['correction']}")
        print("---")


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
