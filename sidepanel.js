document.addEventListener('DOMContentLoaded', function() {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    let pageContent = '';
    let conversationHistory = [];

    function updatePageContent() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                if (tabs[0].url.startsWith('chrome://')) {
                    pageContent = "이 페이지의 내용은 보안상의 이유로 접근할 수 없습니다.";
                    console.log("Chrome internal page detected. Cannot access content.");
                    return;
                }
    
                chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
                    if (chrome.runtime.lastError) {
                        console.warn("Error getting page content:", chrome.runtime.lastError.message);
                        
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            function: getPageContent
                        }, (injectionResults) => {
                            if (chrome.runtime.lastError) {
                                console.error('Script injection failed:', chrome.runtime.lastError.message);
                                pageContent = "페이지 내용을 가져오는 데 실패했습니다.";
                            } else if (injectionResults && injectionResults[0]) {
                                pageContent = injectionResults[0].result;
                                console.log("Page content updated via injection:", pageContent.substring(0, 100) + "...");
                            }
                        });
                    } else if (response && response.content) {
                        pageContent = response.content;
                        console.log("Page content updated:", pageContent.substring(0, 100) + "...");
                    }
                });
            }
        });
    }

    function getPageContent() {
        return document.body.innerText;
    }

    updatePageContent();
    setInterval(updatePageContent, 5000);

    function addMessage(message, isUser) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(isUser ? 'user-message' : 'ai-message');
        messageElement.textContent = message;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        conversationHistory.push({role: isUser ? "User" : "Chatbot", message: message});
    }

    function updateAIMessage(text) {
        let aiMessage = chatMessages.lastElementChild;
        if (!aiMessage || !aiMessage.classList.contains('ai-message')) {
            aiMessage = document.createElement('div');
            aiMessage.classList.add('message', 'ai-message');
            chatMessages.appendChild(aiMessage);
        }
        aiMessage.textContent = text;
        chatMessages.scrollTop = chatMessages.scrollHeight;

        const copyButton = document.createElement('span');
        copyButton.textContent = '복사';
        copyButton.style.position = 'absolute';
        copyButton.style.bottom = '10px';
        copyButton.style.right = '10px';
        copyButton.style.cursor = 'pointer';
        copyButton.style.color = '#8b4513'; // 어두운 브라운 색상
        copyButton.addEventListener('click', function() {
            navigator.clipboard.writeText(aiMessage.textContent.replace('복사', '')) // "복사" 글자 제거하고 복사
                .then(() => {
                    console.log('Content copied to clipboard');
                })
                .catch(err => {
                    console.error('Failed to copy: ', err);
                });
        });
        aiMessage.appendChild(copyButton);
    }

    function sendMessage() {
        const message = userInput.value.trim();
        if (message) {
            addMessage(message, true);
            userInput.value = '';
            
            chrome.storage.sync.get(['cohereApiKey', 'mistralApiKey', 'geminiApiKey', 'selectedModel', 'instructions'], function(result) {
                if (!result.cohereApiKey && !result.mistralApiKey && !result.geminiApiKey) {
                    addMessage("API 키를 설정해주세요.", false);
                    return;
                }
    
                const chatHistory = conversationHistory.map(item => ({
                    role: item.role,
                    message: item.message
                }));
    
                updateAIMessage("답변을 생성 중입니다...");
    
                const contextMessage = pageContent.startsWith("이 페이지의 내용은") || pageContent.startsWith("페이지 내용을")
                    ? "현재 페이지의 내용을 가져올 수 없습니다."
                    : `현재 웹페이지의 내용: ${pageContent}`;
    
                let apiUrl, headers, body;

                if (result.selectedModel === 'mistralSmall') {
                    apiUrl = 'https://api.mistral.ai/v1/chat/completions';
                    headers = {
                        'Authorization': `Bearer ${result.mistralApiKey.trim()}`,
                        'Content-Type': 'application/json'
                    };
                    body = JSON.stringify({
                        model: "mistral-small-latest",
                        messages: [
                            { role: "user", content: result.instructions ? `${result.instructions.join('\n')}\n${contextMessage}\n\n사용자 질문: ${message}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.` : `${contextMessage}\n\n사용자 질문: ${message}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.}` }
                        ],
                        stream: true
                    });
                } else if (result.selectedModel === 'gemini') {
                    apiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';
                    headers = {
                        'Authorization': `Bearer ${result.geminiApiKey.trim()}`,
                        'Content-Type': 'application/json'
                    };
                    body = JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `${result.instructions ? result.instructions.join('\n') + '\n' : ''}${contextMessage}\n\n사용자 질문: ${message}`
                            }]
                        }]
                    });
                } else { // default to cohere
                    apiUrl = 'https://api.cohere.com/v1/chat';
                    headers = {
                        'Authorization': `Bearer ${result.cohereApiKey.trim()}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    };
                    body = JSON.stringify({
                        message: result.instructions ? `${result.instructions.join('\n')}\n${contextMessage}\n\n사용자 질문: ${message}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.` : `${contextMessage}\n\n사용자 질문: ${message}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`,
                        chat_history: chatHistory,
                        stream: true,
                        temperature: 0.7
                    });
                }

                fetch(apiUrl, {
                    method: 'POST',
                    headers: headers,
                    body: body
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const reader = response.body.getReader();
                    let accumulatedResponse = "";
                    let buffer = "";

                    function readStream() {
                        reader.read().then(function processText({ done, value }) {
                            if (done) {
                                updateAIMessage(accumulatedResponse);
                                conversationHistory.push({role: "Chatbot", message: accumulatedResponse});
                                
                                // 답변이 완료된 후에 AI 모델 이름 표시
                                const aiModelNameSpan = document.createElement('span');
                                aiModelNameSpan.textContent = `(${result.selectedModel})`;
                                aiModelNameSpan.style.marginLeft = '10px';
                                aiModelNameSpan.style.fontSize = '0.9em';
                                aiModelNameSpan.style.color = '#666';
                                chatMessages.appendChild(aiModelNameSpan);
                                
                                return;
                            }
                    
                            buffer += new TextDecoder().decode(value);
                            const lines = buffer.split('\n');
                            buffer = lines.pop(); // 마지막 라인은 버퍼에 남김
                    
                            lines.forEach(line => {
                                if (line.trim() !== '') {
                                    let jsonLine = line;
                                    // Check and remove 'data: ' prefix if present
                                    if (line.startsWith('data: ')) {
                                        jsonLine = line.slice(6);
                                    }
                                    // Check and remove 'event: ' prefix if present
                                    if (jsonLine.startsWith('event:')) {
                                        return; // Skip event lines
                                    }
                                    
                                    // Only parse if it starts with '{'
                                    if (jsonLine.startsWith('{')) {
                                        try {
                                            const parsed = JSON.parse(jsonLine);
                                            if (result.selectedModel === 'mistralSmall') {
                                                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                                    accumulatedResponse += parsed.choices[0].delta.content;
                                                }
                                            } else if (result.selectedModel === 'gemini') {
                                                if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content) {
                                                    accumulatedResponse += parsed.candidates[0].content;
                                                }
                                            } else {
                                                if (parsed.event_type === 'text-generation') {
                                                    accumulatedResponse += parsed.text;
                                                }
                                            }
                                            updateAIMessage(accumulatedResponse);
                                        } catch (e) {
                                            console.warn('Incomplete JSON, buffering:', e);
                                        }
                                    }
                                }
                            });
                    
                            return readStream();
                        });
                    }

                    readStream();
                })
                .catch(error => {
                    console.error('Error:', error);
                    updateAIMessage(`API 요청 중 오류가 발생했습니다: ${error.message}`);
                });
            });
        }
    }

    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContent") {
      sendResponse({content: document.body.innerText});
    }
    return true;  // 비동기 응답을 위해 true 반환
});
