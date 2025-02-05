from flask import Flask, request, jsonify, render_template
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
import os
from dotenv import load_dotenv
from utils import (
    extract_video_id, 
    get_video_info, 
    get_transcript, 
    analyze_with_llm,
    process_transcript_with_fact_check
)
import traceback
import json
import asyncio
import concurrent.futures
from functools import partial
from database import init_db, save_analysis, get_analysis

# Load environment variables
load_dotenv()

# Initialize database
init_db()

# Create a ThreadPoolExecutor for running async tasks
executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)

app = Flask(__name__, static_folder='static', template_folder='templates')

def run_async(func, *args, **kwargs):
    """Run a function asynchronously using the thread pool."""
    return executor.submit(func, *args, **kwargs)

# Error handlers
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Not Found'}), 404

@app.errorhandler(Exception)
def handle_error(error):
    print(f"Error occurred: {str(error)}")
    print("Traceback:")
    print(traceback.format_exc())
    return jsonify({'error': str(error)}), 500

# Main routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze', methods=['POST'])
def analyze_video():
    try:
        data = request.get_json()
        video_url = data.get('video_url')
        
        if not video_url:
            return jsonify({'error': 'No video URL provided'}), 400
            
        print(f"\nAnalyzing video: {video_url}")
        
        # Extract video ID and get basic info
        video_id = extract_video_id(video_url)
        if not video_id:
            return jsonify({'error': 'Invalid YouTube URL'}), 400
            
        print(f"Video ID: {video_id}")
        
        # Get video information and transcript concurrently
        video_info_future = run_async(get_video_info, video_url)
        transcript_future = run_async(get_transcript, video_id)
        
        try:
            video_info = video_info_future.result()
            print(f"Video info retrieved: {video_info}")
        except Exception as e:
            print(f"Error getting video info: {str(e)}")
            video_info = None
            
        try:
            transcript = transcript_future.result()
            print(f"Transcript retrieved ({len(transcript)} segments)")
        except Exception as e:
            print(f"Error getting transcript: {str(e)}")
            return jsonify({'error': f'Error fetching transcript: {str(e)}'}), 500
            
        # Start all LLM analysis tasks concurrently
        transcript_json = json.dumps(transcript)
        fact_check_future = run_async(analyze_with_llm, transcript_json, 'fact_check')
        summary_future = run_async(analyze_with_llm, transcript, 'summarize')
        key_points_future = run_async(analyze_with_llm, transcript, 'key_points')
        
        try:
            # Get results from all futures
            fact_check = fact_check_future.result() or {'results': []}
            summary = summary_future.result()
            key_points = key_points_future.result()
            
            if not summary or not key_points:
                return jsonify({'error': 'Failed to generate analysis. Please try again.'}), 500
                
            print("Analysis complete")
            
            # Save analysis results to database
            save_analysis(
                video_id=video_id,
                video_url=video_url,
                video_info=video_info,
                summary=summary,
                key_points=key_points,
                fact_check=fact_check
            )
        except Exception as e:
            print(f"Error in LLM analysis: {str(e)}")
            return jsonify({'error': f'Error analyzing content: {str(e)}'}), 500
        
        # Process transcript with fact-checking annotations
        annotated_transcript = process_transcript_with_fact_check(transcript, fact_check)
        
        return jsonify({
            'video_info': video_info,
            'transcript': annotated_transcript,
            'summary': summary,
            'key_points': key_points,
            'fact_check': fact_check
        })
        
    except Exception as e:
        print(f"Error in analyze_video: {str(e)}")
        print("Traceback:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500




@app.route('/api/transcript', methods=['GET'])
def get_video_transcript():
    """Get video transcript with fact checking."""
    try:
        video_url = request.args.get('video_url')
        if not video_url:
            return jsonify({"error": "No video URL provided"}), 400
            
        print(f"\nGetting transcript for video: {video_url}")
        
        # Extract video ID
        video_id = extract_video_id(video_url)
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400
            
        # Get transcript
        transcript = get_transcript(video_id)
        if not transcript:
            return jsonify({"error": "Could not retrieve transcript"}), 404
            
        # Get fact checks for the transcript
        fact_check_results = analyze_with_llm(transcript, 'fact_check')
        
        # Combine transcript with fact checks
        result = {
            'transcript': transcript,
            'fact_checks': fact_check_results if fact_check_results else {'results': []}
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error in get_video_transcript: {str(e)}")
        print("Traceback:")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500



@app.route('/api/summary', methods=['GET'])
def get_video_summary():
    """Get a summary of the video content."""
    try:
        video_url = request.args.get('video_url')
        if not video_url:
            return jsonify({"error": "No video URL provided"}), 400
            
        print(f"\nGetting summary for video: {video_url}")
        
        # Extract video ID
        video_id = extract_video_id(video_url)
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400
            
        # Get transcript
        transcript = get_transcript(video_id)
        if not transcript:
            return jsonify({"error": "Could not retrieve transcript"}), 404
            
        # Get summary from LLM
        summary = analyze_with_llm(transcript, 'summarize')
        
        return jsonify({
            'summary': summary
        })
        
    except Exception as e:
        print(f"Error in get_video_summary: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/question', methods=['POST'])
def ask_question():
    """Ask a question about the video."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        video_url = data.get('video_url')
        question = data.get('question')
        
        if not video_url or not question:
            return jsonify({"error": "Missing video_url or question"}), 400
            
        # Get video ID and transcript
        video_id = extract_video_id(video_url)
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400
            
        # Get transcript and analyze question concurrently
        transcript_future = run_async(get_transcript, video_id)
        
        try:
            transcript = transcript_future.result()
        except Exception as e:
            print(f"Error getting transcript: {str(e)}")
            return jsonify({"error": "Could not retrieve transcript"}), 404
            
        # Get answer from LLM asynchronously
        answer_future = run_async(analyze_with_llm, transcript, 'question', question=question)
        
        try:
            answer = answer_future.result()
        except Exception as e:
            print(f"Error getting answer: {str(e)}")
            return jsonify({"error": str(e)}), 500
        
        return jsonify({
            'video_url': video_url,
            'video_id': video_id,
            'question': question,
            'answer': answer
        })
        
    except Exception as e:
        print(f"Error in ask_question: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=1337, debug=True)
