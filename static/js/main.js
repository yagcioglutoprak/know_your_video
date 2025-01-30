document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('video-url');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const loadingElement = document.getElementById('loading');
    const questionInput = document.getElementById('question-input');
    const progressBar = document.getElementById('progress-bar');
    const videoContainer = document.getElementById('video-container');
    const youtubePlayer = document.getElementById('youtube-player');
    let progressInterval;
    let youtubeIframe = null;

    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('[data-tab-content]').forEach(content => {
                content.classList.remove('active');
            });
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Show corresponding content
            const targetId = button.getAttribute('data-tab-target');
            const targetContent = document.querySelector(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // Analyze video function
    async function analyzeVideo(url) {
        try {
            showLoading();
            
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ video_url: url })
            });

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            const data = await response.json();
            displayResults(data);
        } catch (error) {
            showError(error.message);
        } finally {
            hideLoading();
        }
    }

    // Helper function to update tab content
    function updateTabContent(selector, content) {
        const element = document.querySelector(selector);
        if (element) {
            element.innerHTML = content;
        }
    }

    // Display results function
    async function displayResults(data) {
        console.log('Received data:', data);
        hideLoading();
        resultsContainer.classList.remove('hidden');
        
        // Extract video ID and initialize player
        const videoId = extractVideoId(videoUrlInput.value);
        if (videoId) {
            initYouTubePlayer(videoId);
        }
        
        // Update summary tab
        if (data.summary) {
            try {
                const summaryData = typeof data.summary === 'string' ? JSON.parse(data.summary) : data.summary;
                
                if (!summaryData) {
                    throw new Error('No summary data available');
                }
                
                const summaryContent = `
                    <div class="space-y-6">
                        <div class="bg-gray-900/50 rounded-xl p-4 backdrop-blur-sm border border-gray-800">
                            <h3 class="text-lg font-semibold text-gray-100 mb-2">Overview</h3>
                            <p class="text-gray-200">${summaryData.brief_overview}</p>
                        </div>
                        
                        <div class="bg-gray-900/50 rounded-xl p-4 backdrop-blur-sm border border-gray-800">
                            <h3 class="text-lg font-semibold text-gray-100 mb-4">Detailed Summary</h3>
                            <div class="space-y-4">
                                <div class="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <h4 class="text-gray-100 font-medium mb-2">Introduction</h4>
                                    <p class="text-gray-200">${summaryData.detailed_summary.introduction}</p>
                                </div>
                                <div class="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <h4 class="text-gray-100 font-medium mb-2">Main Content</h4>
                                    <p class="text-gray-200">${summaryData.detailed_summary.main_content}</p>
                                </div>
                                <div class="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <h4 class="text-gray-100 font-medium mb-2">Conclusion</h4>
                                    <p class="text-gray-200">${summaryData.detailed_summary.conclusion}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-gray-900/50 rounded-xl p-4 backdrop-blur-sm border border-gray-800">
                                <h3 class="text-lg font-semibold text-gray-100 mb-2">Topics Covered</h3>
                                <ul class="list-disc list-inside space-y-1">
                                    ${summaryData.topics_covered.map(topic => `
                                        <li class="text-gray-200">${topic}</li>
                                    `).join('')}
                                </ul>
                            </div>
                            
                            <div class="bg-gray-900/50 rounded-xl p-4 backdrop-blur-sm border border-gray-800">
                                <h3 class="text-lg font-semibold text-gray-100 mb-2">Key Takeaways</h3>
                                <ul class="list-disc list-inside space-y-1">
                                    ${summaryData.key_takeaways.map(point => `
                                        <li class="text-gray-200">${point}</li>
                                    `).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                `;
                
                updateTabContent('#summary', summaryContent);
            } catch (error) {
                console.error('Error parsing summary:', error);
                updateTabContent('#summary', '<p class="text-red-500">Error displaying summary</p>');
            }
        }

        // Update key points tab
        if (data.key_points) {
            try {
                const keyPointsData = typeof data.key_points === 'string' ? JSON.parse(data.key_points) : data.key_points;
                const keyPointsContent = `
                    <div class="space-y-4">
                        ${keyPointsData.main_points.map(point => `
                            <div class="keypoint-item">
                                ${point.timestamp ? 
                                    `<div class="keypoint-timestamp mb-2" onclick="seekToTime('${point.timestamp}')">${point.timestamp}</div>` 
                                    : ''
                                }
                                <p class="text-gray-200 font-medium">${point.point}</p>
                                ${point.details ? `<p class="text-gray-300 mt-2 text-sm">${point.details}</p>` : ''}
                                ${point.importance ? `<span class="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">${point.importance}</span>` : ''}
                            </div>
                        `).join('')}
                        
                        ${keyPointsData.themes ? `
                            <div class="mt-8 bg-gray-900/50 rounded-xl p-4 backdrop-blur-sm border border-gray-800">
                                <h3 class="text-lg font-semibold text-gray-100 mb-2">Overall Themes</h3>
                                <ul class="list-disc list-inside space-y-1">
                                    ${keyPointsData.themes.map(theme => `
                                        <li class="text-gray-200">${theme}</li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                `;
                
                updateTabContent('#keypoints-content', keyPointsContent);
            } catch (error) {
                console.error('Error parsing key points:', error);
                updateTabContent('#keypoints-content', '<p class="text-red-500">Error displaying key points</p>');
            }
        }

        // Update fact check tab
        if (data.fact_check) {
            try {
                const factCheckData = typeof data.fact_check === 'string' ? JSON.parse(data.fact_check) : data.fact_check;
                
                // Group facts by status
                const groupedFacts = factCheckData.results.reduce((acc, fact) => {
                    const status = fact.status.toUpperCase();
                    if (!acc[status]) acc[status] = [];
                    acc[status].push(fact);
                    return acc;
                }, {});

                const factCheckContent = `
                    <div class="space-y-8">
                        ${groupedFacts['TRUE'] ? `
                            <div class="fact-group">
                                <h3 class="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                    Verified Facts
                                </h3>
                                <div class="space-y-4">
                                    ${groupedFacts['TRUE'].map(fact => renderFactItem(fact, 'true')).join('')}
                                </div>
                            </div>
                        ` : ''}

                        ${groupedFacts['FALSE'] ? `
                            <div class="fact-group">
                                <h3 class="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                    False Claims
                                </h3>
                                <div class="space-y-4">
                                    ${groupedFacts['FALSE'].map(fact => renderFactItem(fact, 'false')).join('')}
                                </div>
                            </div>
                        ` : ''}

                        ${groupedFacts['SKIP'] ? `
                            <div class="fact-group">
                                <h3 class="text-lg font-semibold text-yellow-400 mb-4 flex items-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                    </svg>
                                    Unverified Claims
                                </h3>
                                <div class="space-y-4">
                                    ${groupedFacts['SKIP'].map(fact => renderFactItem(fact, 'skip')).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
                
                updateTabContent('#factcheck-content', factCheckContent);
            } catch (error) {
                console.error('Error parsing fact check:', error);
                updateTabContent('#factcheck-content', '<p class="text-red-500">Error displaying fact check results</p>');
            }
        }

        // Update transcript tab
        if (data.transcript) {
            try {
                const transcriptSegments = Array.isArray(data.transcript) ? data.transcript : [];
                
                // Group segments by 30-second intervals for better organization
                const groupedSegments = {};
                transcriptSegments.forEach(segment => {
                    const thirtySecInterval = Math.floor(segment.start / 30);
                    if (!groupedSegments[thirtySecInterval]) {
                        groupedSegments[thirtySecInterval] = [];
                    }
                    groupedSegments[thirtySecInterval].push(segment);
                });

                let transcriptHtml = '<div class="grid grid-cols-2 gap-4">';
                Object.keys(groupedSegments).sort((a, b) => Number(a) - Number(b)).forEach(interval => {
                    const segments = groupedSegments[interval];
                    const startTime = formatTime(interval * 30);
                    const endTime = formatTime((Number(interval) + 1) * 30);
                    
                    transcriptHtml += `
                        <div class="bg-black/30 rounded-lg p-4 border border-pink-500/30 hover:bg-black/40 transition-all">
                            <div class="text-pink-400 font-medium mb-2 flex items-center justify-between">
                                <span>${startTime} - ${endTime}</span>
                            </div>
                            <div class="space-y-2">
                    `;
                    
                    // Process each segment in this interval
                    segments.forEach(segment => {
                        const segmentStart = segment.start;
                        const segmentEnd = segment.start + segment.duration;
                        const factCheckStatus = segment.fact_check?.status?.toLowerCase() || 'unverified';
                        
                        let segmentClass = 'text-pink-100';
                        let statusIcon = '';
                        let tooltipContent = '';
                        let borderClass = '';
                        let bgClass = '';
                        
                        if (factCheckStatus === 'true' || factCheckStatus === 'verified') {
                            segmentClass = 'text-green-100';
                            statusIcon = '<span class="text-green-500 mr-2">✓</span>';
                            borderClass = 'border-l-4 border-l-green-500';
                            bgClass = 'bg-green-500/5';
                            
                            const explanation = segment.fact_check.explanation || '';
                            const references = segment.fact_check.references || [];
                            const claim = segment.fact_check.claim || segment.text;
                            
                            tooltipContent = `
                                <div class="text-green-100 text-sm">
                                    <p class="font-medium mb-2">Verified Fact</p>
                                    <p class="text-green-300 mb-2 whitespace-normal break-words">${claim}</p>
                                    <p class="text-green-300 mb-2 whitespace-normal break-words">${explanation}</p>
                                    ${references.length > 0 ? `
                                        <div class="space-y-1">
                                            <p class="text-green-400 text-xs font-medium">Sources:</p>
                                            ${references.map(ref => `
                                                <a href="${ref}" target="_blank" rel="noopener noreferrer" 
                                                   class="block text-green-400 hover:text-green-300 text-xs whitespace-normal break-all">
                                                    ${ref}
                                                </a>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        } else if (factCheckStatus === 'false' || factCheckStatus === 'misinformation') {
                            segmentClass = 'text-red-100';
                            statusIcon = '<span class="text-red-500 mr-2">✗</span>';
                            borderClass = 'border-l-4 border-l-red-500';
                            bgClass = 'bg-red-500/5';
                            
                            const explanation = segment.fact_check.explanation || '';
                            const references = segment.fact_check.references || [];
                            const claim = segment.fact_check.claim || segment.text;
                            
                            tooltipContent = `
                                <div class="text-red-100 text-sm">
                                    <p class="font-medium mb-2">False Claim</p>
                                    <p class="text-red-300 mb-2 whitespace-normal break-words">${claim}</p>
                                    <p class="text-red-300 mb-2 whitespace-normal break-words">${explanation}</p>
                                    ${references.length > 0 ? `
                                        <div class="space-y-1">
                                            <p class="text-red-400 text-xs font-medium">Sources:</p>
                                            <div class="space-y-1">
                                                ${references.map(ref => `
                                                    <a href="${ref}" target="_blank" rel="noopener noreferrer" 
                                                       class="block text-red-400 hover:text-red-300 text-xs whitespace-normal break-all">
                                                        ${ref}
                                                    </a>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }
                        
                        transcriptHtml += `
                            <div class="group relative">
                                <div class="cursor-pointer ${borderClass} ${bgClass} pl-3 p-2 rounded transition-all"
                                     onclick="playSegment(${segmentStart}, ${segmentEnd})">
                                    <div class="${segmentClass} flex items-start gap-2 hover:opacity-80">
                                        <span class="text-xs text-pink-400 mt-1 min-w-[45px]">${formatTime(segmentStart)}</span>
                                        <span class="flex-1">
                                            ${statusIcon}${segment.text}
                                        </span>
                                    </div>
                                </div>
                                ${tooltipContent ? `
                                    <div class="fact-tooltip opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 top-full mt-2 w-[600px] z-[9999] p-4 bg-black/95 border border-pink-500/30 rounded-lg shadow-xl pointer-events-none">
                                        ${tooltipContent}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    });
                    
                    transcriptHtml += `
                            </div>
                        </div>
                    `;
                });
                
                transcriptHtml += '</div>';
                
                const transcriptTab = document.getElementById('transcript');
                if (transcriptTab) {
                    const transcriptContent = transcriptTab.querySelector('.prose');
                    if (transcriptContent) {
                        transcriptContent.innerHTML = transcriptHtml;
                    }
                }
            } catch (error) {
                console.error('Error displaying transcript:', error);
                const transcriptTab = document.getElementById('transcript');
                if (transcriptTab) {
                    const transcriptContent = transcriptTab.querySelector('.prose');
                    if (transcriptContent) {
                        transcriptContent.innerHTML = `
                            <div class="p-4 bg-black/30 rounded-lg border border-pink-500/30">
                                <p class="text-pink-400">Error displaying transcript: ${error.message}</p>
                                <p class="text-pink-300 mt-2">Please try analyzing the video again.</p>
                            </div>
                        `;
                    }
                }
            }
        }

        // Update fact-check tab
        const factChecks = {
            verified: [],
            misinformation: [],
            unverified: []
        };
        
        // Process transcript segments to collect fact checks
        if (data.transcript) {
            const transcriptSegments = Array.isArray(data.transcript) ? data.transcript : [];
            transcriptSegments.forEach(segment => {
                if (segment.fact_check) {
                    const status = segment.fact_check.status.toLowerCase();
                    const factCheck = {
                        claim: segment.fact_check.claim || segment.text,
                        explanation: segment.fact_check.explanation,
                        references: segment.fact_check.references,
                        timestamp: formatTime(segment.start),
                        videoTime: segment.start
                    };
                    
                    if (status === 'true' || status === 'verified') {
                        factChecks.verified.push(factCheck);
                    } else if (status === 'false' || status === 'misinformation') {
                        factChecks.misinformation.push(factCheck);
                    } else {
                        factChecks.unverified.push(factCheck);
                    }
                }
            });
        }
        
        // Update fact-check content with improved UI
        const factCheckHtml = `
            <div class="space-y-6">
                <!-- Stats Overview -->
                <div class="grid grid-cols-3 gap-4 mb-6">
                    <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-green-400 mb-1">✓</div>
                        <div class="text-2xl font-bold text-green-400">${factChecks.verified.length}</div>
                        <div class="text-green-300 text-sm">Verified Facts</div>
                    </div>
                    <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-yellow-400 mb-1">?</div>
                        <div class="text-2xl font-bold text-yellow-400">${factChecks.unverified.length}</div>
                        <div class="text-yellow-300 text-sm">Unverified Claims</div>
                    </div>
                    <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-red-400 mb-1">✗</div>
                        <div class="text-2xl font-bold text-red-400">${factChecks.misinformation.length}</div>
                        <div class="text-red-300 text-sm">False Claims</div>
                    </div>
                </div>

                <!-- Verified Facts -->
                <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-2xl text-green-400">✓</span>
                        <h3 class="text-xl font-semibold text-green-400">Verified Facts</h3>
                    </div>
                    <div class="space-y-4">
                        ${factChecks.verified.map(fact => `
                            <div class="bg-green-500/5 border border-green-500/20 rounded-lg p-4 hover:bg-green-500/10 transition-all">
                                <div class="flex items-start gap-4">
                                    <div class="flex-1">
                                        <p class="text-green-100 font-medium">${fact.claim}</p>
                                        <p class="text-green-300 text-sm mt-2">${fact.explanation}</p>
                                        ${fact.references && fact.references.length > 0 ? `
                                            <div class="mt-2 space-y-1">
                                                <p class="text-green-400 text-xs font-medium">Sources:</p>
                                                <div class="space-y-1">
                                                    ${fact.references.map(ref => `
                                                        <a href="${ref}" target="_blank" rel="noopener noreferrer" 
                                                           class="block text-green-400 hover:text-green-300 text-xs whitespace-normal break-all">
                                                            ${ref}
                                                        </a>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        ` : ''}
                                        ${fact.timestamp ? `
                                            <div class="mt-2">
                                                <p class="text-green-400 text-xs">Timestamp: ${fact.timestamp}</p>
                                            </div>
                                        ` : ''}
                                    </div>
                                    ${fact.timestamp ? `
                                        <button class="px-3 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all text-sm"
                                                data-timestamp="${fact.timestamp}">
                                            Jump to clip
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('') || '<p class="text-green-300 text-center py-4">No verified facts found</p>'}
                    </div>
                </div>

                <!-- False Claims -->
                <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-2xl text-red-400">✗</span>
                        <h3 class="text-xl font-semibold text-red-400">False Claims</h3>
                    </div>
                    <div class="space-y-4">
                        ${factChecks.misinformation.map(fact => `
                            <div class="bg-red-500/5 border border-red-500/20 rounded-lg p-4 hover:bg-red-500/10 transition-all">
                                <div class="flex items-start gap-4">
                                    <div class="flex-1">
                                        <p class="text-red-100 font-medium">${fact.claim}</p>
                                        <p class="text-red-300 text-sm mt-2">${fact.explanation}</p>
                                        ${fact.references && fact.references.length > 0 ? `
                                            <div class="mt-2 space-y-1">
                                                <p class="text-red-400 text-xs font-medium">Sources:</p>
                                                <div class="space-y-1">
                                                    ${fact.references.map(ref => `
                                                        <a href="${ref}" target="_blank" rel="noopener noreferrer" 
                                                           class="block text-red-400 hover:text-red-300 text-xs whitespace-normal break-all">
                                                            ${ref}
                                                        </a>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        ` : ''}
                                        ${fact.timestamp ? `
                                            <div class="mt-2">
                                                <p class="text-red-400 text-xs">Timestamp: ${fact.timestamp}</p>
                                            </div>
                                        ` : ''}
                                    </div>
                                    ${fact.timestamp ? `
                                        <button class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm"
                                                data-timestamp="${fact.timestamp}">
                                            Jump to clip
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('') || '<p class="text-red-300 text-center py-4">No false claims found</p>'}
                    </div>
                </div>

                <!-- Unverified Claims -->
                <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-2xl text-yellow-400">?</span>
                        <h3 class="text-xl font-semibold text-yellow-400">Unverified Claims</h3>
                    </div>
                    <div class="space-y-4">
                        ${factChecks.unverified.map(fact => `
                            <div class="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 hover:bg-yellow-500/10 transition-all">
                                <div class="flex items-start gap-4">
                                    <div class="flex-1">
                                        <p class="text-yellow-100 font-medium">${fact.claim}</p>
                                        <p class="text-yellow-300 text-sm mt-2">${fact.explanation}</p>
                                    </div>
                                    ${fact.timestamp ? `
                                        <span class="text-yellow-400 text-sm whitespace-nowrap">${fact.timestamp}</span>
                                    ` : ''}
                                </div>
                                ${fact.timestamp ? `
                                    <button class="px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-all text-sm"
                                            data-timestamp="${fact.timestamp}">
                                        Jump to clip
                                    </button>
                                ` : ''}
                            </div>
                        `).join('') || '<p class="text-yellow-300 text-center py-4">No unverified claims found</p>'}
                    </div>
                </div>
            </div>
        `;
        
        const factCheckTab = document.getElementById('fact-check');
        if (factCheckTab) {
            const factCheckContent = factCheckTab.querySelector('.prose');
            if (factCheckContent) {
                factCheckContent.innerHTML = factCheckHtml;
            }
        }

        // Update Q&A section
        const qaTab = document.getElementById('qa');
        if (qaTab) {
            const qaContent = qaTab.querySelector('.prose');
            if (qaContent) {
                qaContent.innerHTML = `
                    <div class="space-y-4">
                        <p class="text-pink-400">Ask questions about the video content...</p>
                    </div>
                `;
            }
        }

        // Add video info if available
        if (data.video_info) {
            const videoInfo = document.getElementById('video-info');
            if (videoInfo) {
                videoInfo.innerHTML = `
                    <div class="text-sm text-gray-400">
                        <h3 class="text-lg font-semibold text-pink-400">${data.video_info.title}</h3>
                        <p class="mt-1">Channel: ${data.video_info.channel}</p>
                    </div>
                `;
            }
        }
    }

    // Q&A functionality
    async function askQuestion(question) {
        try {
            showLoading();
            const response = await fetch('/api/question', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    video_url: videoUrlInput.value.trim(),
                    question: question 
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get answer');
            }

            // Make sure video player is initialized with the correct video
            if (data.video_id) {
                if (!player) {
                    await initYouTubePlayer(data.video_id);
                } else {
                    const currentVideoId = player.getVideoData().video_id;
                    if (currentVideoId !== data.video_id) {
                        player.loadVideoById(data.video_id);
                    }
                }
            }

            const qaResults = document.getElementById('qa-results');
            
            // Add new Q&A pair to the results
            const qaElement = document.createElement('div');
            qaElement.className = 'mb-4 p-4 bg-black/30 rounded-lg border border-pink-500/30';
            
            // Process answer for markdown
            const processedAnswer = marked.parse(data.answer);
            
            qaElement.innerHTML = `
                <div class="space-y-4">
                    <div class="flex items-start gap-3">
                        <span class="text-pink-400 font-semibold text-lg">Q:</span>
                        <p class="qa-question text-pink-100">${question}</p>
                    </div>
                    <div class="flex items-start gap-3">
                        <span class="text-pink-400 font-semibold text-lg">A:</span>
                        <div class="qa-answer prose prose-invert prose-pink max-w-none">
                            ${processedAnswer}
                        </div>
                    </div>
                </div>
            `;
            
            // Style code blocks
            qaElement.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            
            // Process lists to add custom styling
            qaElement.querySelectorAll('.prose ul:not([class*="list-"])').forEach(list => {
                list.querySelectorAll('li').forEach(item => {
                    // Check if this is a main list item (like "Places in Namibia:")
                    if (item.textContent.includes(':')) {
                        const [title, description] = item.textContent.split(':');
                        item.innerHTML = `
                            <div class="qa-list-item">
                                <span class="qa-highlight">${title}:</span>
                                <span class="qa-description">${description.trim()}</span>
                            </div>
                        `;
                    }
                });
            });
            
            if (qaResults) {
                qaResults.insertBefore(qaElement, qaResults.firstChild);
            }
            
            hideLoading();
        } catch (error) {
            hideLoading();
            showError(error.message);
        }
    }

    // Helper functions
    function showLoading() {
        resultsContainer.classList.remove('hidden');
        loadingElement.classList.remove('hidden');
        videoContainer.classList.add('hidden');
        analyzeBtn.disabled = true;
        
        // Reset and start progress bar animation
        progressBar.style.width = '0%';
        let progress = 0;
        progressInterval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 10;
                progressBar.style.width = `${Math.min(progress, 90)}%`;
            }
        }, 500);
    }

    function hideLoading() {
        loadingElement.classList.add('hidden');
        analyzeBtn.disabled = false;
        clearInterval(progressInterval);
        progressBar.style.width = '100%';
        setTimeout(() => {
            progressBar.style.width = '0%';
        }, 300);
    }

    function showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'bg-red-500/20 border border-red-500 text-red-400 p-4 rounded-lg mb-4';
        errorElement.textContent = message;
        
        resultsContainer.prepend(errorElement);
        
        // Remove error after 5 seconds
        setTimeout(() => {
            errorElement.remove();
        }, 5000);
    }

    // Load YouTube IFrame API
    let tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    let firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    let player;
    window.onYouTubeIframeAPIReady = function() {
        console.log('YouTube API Ready');
    };

    // Function to initialize YouTube player
    function initYouTubePlayer(videoId) {
        videoContainer.classList.remove('hidden');
        if (player) {
            player.destroy();
        }
        
        youtubePlayer.innerHTML = '<div id="youtube-iframe"></div>';
        player = new YT.Player('youtube-iframe', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'enablejsapi': 1
            },
            events: {
                'onReady': onPlayerReady
            }
        });
    }

    function onPlayerReady(event) {
        console.log('Player ready');
    }

    // Function to seek to specific time in video
    function seekToTime(timestamp) {
        if (!timestamp) return;
        
        const seconds = timestampToSeconds(timestamp);
        if (seconds === null) return;
        
        if (player && typeof player.seekTo === 'function') {
            console.log('Seeking to:', seconds);
            player.seekTo(seconds, true);
        }
    }

    // Function to convert timestamp string to seconds
    function timestampToSeconds(timestamp) {
        if (!timestamp) return null;
        
        // Handle range format "03:06-03:10" by taking the start time
        if (timestamp.includes('-')) {
            timestamp = timestamp.split('-')[0];
        }
        
        // Parse MM:SS format
        const [minutes, seconds] = timestamp.split(':').map(Number);
        if (isNaN(minutes) || isNaN(seconds)) return null;
        
        return minutes * 60 + seconds;
    }

    // Function to make seekToTime available globally
    window.seekToTime = seekToTime;

    // Function to format time
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Function to extract video ID from URL
    function extractVideoId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // URL validation on input
    videoUrlInput.addEventListener('input', () => {
        const url = videoUrlInput.value.trim();
        const isValidUrl = url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/);
        
        if (isValidUrl) {
            analyzeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            analyzeBtn.disabled = false;
        } else {
            analyzeBtn.classList.add('opacity-50', 'cursor-not-allowed');
            analyzeBtn.disabled = true;
        }
    });

    // Create timestamp button
    function createTimestampButton(timestamp) {
        if (!timestamp) return '';
        
        const buttonId = `timestamp-${Math.floor(Math.random() * 10000)}`;
        
        // Add the click handler after the DOM is updated
        setTimeout(() => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', function() {
                    const time = this.getAttribute('data-timestamp');
                    if (time) {
                        seekToTime(time);
                    }
                });
            }
        }, 0);

        return `
            <button 
                id="${buttonId}"
                type="button"
                data-timestamp="${timestamp}"
                class="inline-flex items-center px-2 py-1 bg-pink-500/20 hover:bg-pink-500/30 rounded text-sm text-pink-300 transition-colors mr-2"
            >
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                ${timestamp}
            </button>
        `;
    }

    // Display factcheck results
    function displayFactCheckResults(factChecks) {
        if (!factChecks || !Array.isArray(factChecks)) return '';
        
        return factChecks.map((check, index) => {
            const timestamp = check.timestamp || check.timestamp_range || '';
            return `
                <div class="bg-black/30 rounded-lg p-4 border border-pink-500/30 mb-4">
                    <div class="flex items-start justify-between">
                        <h4 class="font-medium text-pink-300 flex items-center">
                            Claim ${index + 1} ${timestamp ? createTimestampButton(timestamp) : ''}
                        </h4>
                        <span class="px-2 py-1 rounded text-xs font-medium ${
                            check.status === 'TRUE' ? 'bg-green-500/20 text-green-300' :
                            check.status === 'FALSE' ? 'bg-red-500/20 text-red-300' :
                            'bg-yellow-500/20 text-yellow-300'
                        }">${check.status}</span>
                    </div>
                    <p class="text-pink-100 mt-2">${check.claim}</p>
                    <p class="text-gray-400 mt-2">${check.explanation}</p>
                </div>
            `;
        }).join('');
    }

    // Function to seek to specific time in video
    function seekToTime(timestamp) {
        if (!timestamp) return;
        
        const seconds = timestampToSeconds(timestamp);
        if (seconds === null) return;
        
        if (player && typeof player.seekTo === 'function') {
            console.log('Seeking to:', seconds, 'from timestamp:', timestamp);
            player.seekTo(seconds, true);
        } else {
            console.log('Player not ready');
        }
    }

    // Function to convert timestamp string to seconds
    function timestampToSeconds(timestamp) {
        if (!timestamp) return null;
        
        try {
            // Handle range format "03:06-03:10" by taking the start time
            if (timestamp.includes('-')) {
                timestamp = timestamp.split('-')[0];
            }
            
            // Parse MM:SS format
            const [minutes, seconds] = timestamp.split(':').map(Number);
            if (isNaN(minutes) || isNaN(seconds)) return null;
            
            const totalSeconds = minutes * 60 + seconds;
            console.log('Converted timestamp:', timestamp, 'to seconds:', totalSeconds);
            return totalSeconds;
        } catch (error) {
            console.error('Error parsing timestamp:', error);
            return null;
        }
    }

    // Function to play a specific segment of the video
    function playSegment(start, end) {
        if (player) {
            // Seek to start time
            player.seekTo(start, true);
            // Start playing
            player.playVideo();
        }
    }
    
    // Make playSegment available globally
    window.playSegment = playSegment;

    // Show video preview when URL is entered
    videoUrlInput.addEventListener('input', () => {
        const videoId = extractVideoId(videoUrlInput.value.trim());
        if (videoId) {
            initYouTubePlayer(videoId);
        } else {
            videoContainer.classList.add('hidden');
            youtubePlayer.innerHTML = '';
            if (player) {
                player.destroy();
                player = null;
            }
        }
    });

    // Event listeners
    analyzeBtn.addEventListener('click', () => {
        const url = videoUrlInput.value.trim();
        if (url) {
            analyzeVideo(url);
        } else {
            showError('Please enter a valid YouTube URL');
        }
    });

    questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const question = questionInput.value.trim();
            if (question) {
                askQuestion(question);
                questionInput.value = '';
            }
        }
    });

    // Add event delegation for timestamp buttons
    document.addEventListener('click', function(event) {
        const button = event.target.closest('button[data-timestamp]');
        if (button) {
            const timestamp = button.getAttribute('data-timestamp');
            if (timestamp) {
                seekToTime(timestamp);
            }
        }
    });
});

// Helper function to render a fact item
function renderFactItem(fact, type) {
    const statusClasses = {
        true: 'bg-green-900/20 border-green-700/30',
        false: 'bg-red-900/20 border-red-700/30',
        skip: 'bg-yellow-900/20 border-yellow-700/30'
    };

    const statusBadgeClasses = {
        true: 'bg-green-500/10 text-green-400 border border-green-500/20',
        false: 'bg-red-500/10 text-red-400 border border-red-500/20',
        skip: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
    };

    const icons = {
        true: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
        false: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
        skip: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
    };

    return `
        <div class="fact-item p-4 rounded-lg border ${statusClasses[type]}">
            <div class="flex items-start gap-4">
                <div class="flex-1">
                    ${fact.timestamp_range || fact.timestamp ? `
                        <div class="text-sm text-gray-400 mb-2 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <span class="cursor-pointer hover:text-blue-400 transition-colors" 
                                  onclick="seekToTime('${fact.timestamp_range || fact.timestamp}')">
                                ${fact.timestamp_range || fact.timestamp}
                            </span>
                        </div>
                    ` : ''}
                    <div class="flex items-start gap-2">
                        <span class="mt-1">${icons[type]}</span>
                        <div>
                            <p class="text-gray-200 font-medium">${fact.claim}</p>
                            <p class="text-gray-300 mt-2 text-sm">${fact.explanation}</p>
                        </div>
                    </div>
                    ${fact.references && fact.references.length > 0 ? `
                        <div class="mt-3 pl-6">
                            <h4 class="text-sm font-medium text-gray-400 mb-1">References:</h4>
                            <ul class="list-disc list-inside text-sm text-gray-300">
                                ${fact.references.map(ref => `
                                    <li>${ref}</li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Helper functions for fact check styling
function getFactStatusClass(status) {
    switch (status.toUpperCase()) {
        case 'TRUE':
            return 'bg-green-900/20 border-green-700/30';
        case 'FALSE':
            return 'bg-red-900/20 border-red-700/30';
        case 'SKIP':
        default:
            return 'bg-yellow-900/20 border-yellow-700/30';
    }
}

function getFactStatusBadgeClass(status) {
    switch (status.toUpperCase()) {
        case 'TRUE':
            return 'bg-green-500/10 text-green-400 border border-green-500/20';
        case 'FALSE':
            return 'bg-red-500/10 text-red-400 border border-red-500/20';
        case 'SKIP':
        default:
            return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    }
}
