import requests
import json
from pprint import pprint
import time

# API base URL
BASE_URL = 'http://localhost:1337/api'

# Test video URL
TEST_VIDEO_URL = "https://www.youtube.com/watch?v=cA9XbI0ge0g"

def test_video_analysis():
    """Test the complete video analysis endpoint"""
    print("\n=== Testing Video Analysis ===")
    
    # You can replace this with any YouTube video URL you want to analyze
    video_url = "https://www.youtube.com/watch?v=cA9XbI0ge0g"  # Rick Astley - Never Gonna Give You Up
    
    print(f"Analyzing video: {video_url}")
    response = requests.post(f'{BASE_URL}/analyze', json={'video_url': video_url})
    
    if response.status_code == 200:
        result = response.json()
        
        # Print video information
        print("\nVideo Information:")
        print(f"Title: {result['video_info']['title']}")
        print(f"Thumbnail: {result['video_info']['thumbnail']}")
        
        # Print summary
        print("\nSummary:")
        print(result['analysis']['summary'])
        
        # Print fact-checked transcript
        print("\nFact-Checked Transcript:")
        for entry in result['transcript']:
            print(f"\nTimestamp: {entry['timestamp']}")
            print(f"Text: {entry['text']}")
            
            if entry['fact_check']:
                status = " TRUE" if entry['fact_check']['is_true'] else " FALSE"
                print(f"Status: {status}")
                print(f"Explanation: {entry['fact_check']['explanation']}")
                print("References:")
                for ref in entry['fact_check']['references']:
                    print(f"  - {ref}")
                if not entry['fact_check']['is_true'] and entry['fact_check']['correction']:
                    print(f"Correction: {entry['fact_check']['correction']}")
            
            print("-" * 50)
    else:
        print(f"Error: {response.status_code}")
        print(response.json())

def test_transcript():
    """Test getting video transcript."""
    try:
        print("\n=== Testing Transcript Retrieval ===")
        response = requests.get(f"{BASE_URL}/transcript?video_url={TEST_VIDEO_URL}")
        
        if response.status_code == 200:
            print("Successfully retrieved transcript")
            data = response.json()
            
            # Print transcript
            print("\nTranscript:")
            transcript = data.get('transcript', [])
            if transcript:
                for entry in transcript:
                    start = entry.get('start', 0)
                    text = entry.get('text', '')
                    print(f"[{start:.2f}s] {text}")
            else:
                print("No transcript data found")
            
            # Print fact-check results
            print("\nFact Check Results:")
            fact_checks = data.get('fact_checks', {}).get('results', [])
            if fact_checks:
                for i, fact in enumerate(fact_checks, 1):
                    print(f"\nFact {i}:")
                    print(f"Time Range: {fact['timestamp_range']}")
                    print(f"Claim: {fact['claim']}")
                    print(f"Status: {'✅' if fact['status'] == 'TRUE' else '❌'}")
                    print("References:")
                    for ref in fact['references']:
                        print(f"  - {ref}")
            else:
                print("No verifiable facts found in the transcript")
            
            return True
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"Error in test_transcript: {str(e)}")
        return False

def test_summary():
    """Test getting video summary."""
    print("\n=== Testing Video Summary ===")
    
    response = requests.get(f'{BASE_URL}/summary?video_url={TEST_VIDEO_URL}')
    
    if response.status_code == 200:
        result = response.json()
        print("\nSummary:")
        print(result['summary'])
        return True
    else:
        print(f"Error: {response.status_code}")
        print(response.json())
        return False

def test_question():
    """Test the question endpoint"""
    print("\n=== Testing Question Answering ===")
    
    video_url = "https://www.youtube.com/watch?v=cA9XbI0ge0g"
    question = "What is the main message of this song?"
    
    print(f"Asking question: {question}")
    response = requests.post(f'{BASE_URL}/question', 
                           json={
                               'video_url': video_url,
                               'question': question
                           })
    
    if response.status_code == 200:
        result = response.json()
        print("\nAnswer:")
        print(result['answer'])
    else:
        print(f"Error: {response.status_code}")
        print(response.json())

def main():
    """Run all tests"""
    print("Starting API tests...")
    
    # Make sure the API is running
    try:
        requests.get(f'{BASE_URL}/transcript')
    except requests.exceptions.ConnectionError:
        print("Error: API is not running. Please start the Flask application first.")
        return
    

    try:
        # Run tests
        test_transcript()
        test_summary()  
        test_question()
        test_video_analysis()
        
    except Exception as e:
        print(f"\nError running tests: {str(e)}")
        
if __name__ == "__main__":
    main()
