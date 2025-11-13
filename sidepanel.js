document.addEventListener('DOMContentLoaded', function() {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    let pageContent = '';
    let conversationHistory = [];

    // 페이지 컨텐츠 업데이트 함수
    async function updatePageContent() {
        try {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (tabs[0]) {
                if (tabs[0].url.startsWith('chrome://')) {
                    pageContent = "이 페이지의 내용은 보안상의 이유로 접근할 수 없습니다.";
                    console.log("Chrome internal page detected. Cannot access content.");
                    return;
                }

                const response = await chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"});
                if (response && response.content) {
                    pageContent = response.content;
                    console.log("Page content updated:", pageContent.substring(0, 100) + "...");
                } else {
                    throw new Error("Failed to get page content");
                }
            }
        } catch (error) {
            console.error('Error updating page content:', error);
            pageContent = "페이지 내용을 가져오는 데 실패했습니다.";
        }
    }

    // 초기 페이지 컨텐츠 업데이트
    updatePageContent();

    // 메시지 추가 함수
    function addMessage(message, isUser) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', isUser ? 'user-message' : 'ai-message');
        if (!isUser && window.MarkdownRenderer) {
            window.MarkdownRenderer.ensureStylesInjected();
            const md = message || "";
            messageElement.setAttribute('data-md-source', md);
            // create inner wrapper to avoid styling root message box
            const wrapper = document.createElement('div');
            wrapper.classList.add('markdown-body');
            messageElement.appendChild(wrapper);
            window.MarkdownRenderer.renderInto(wrapper, md);
        } else {
            messageElement.textContent = message;
        }
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        conversationHistory.push({role: isUser ? "User" : "Chatbot", message: message});
    }

    // AI 메시지 업데이트 함수
    function updateAIMessage(text) {
        let aiMessage = chatMessages.lastElementChild;
        if (!aiMessage || !aiMessage.classList.contains('ai-message')) {
            aiMessage = document.createElement('div');
            aiMessage.classList.add('message', 'ai-message');
            chatMessages.appendChild(aiMessage);
        }
        if (window.MarkdownRenderer) {
            window.MarkdownRenderer.ensureStylesInjected();
            const md = text || "";
            aiMessage.setAttribute('data-md-source', md);
            let wrapper = aiMessage.querySelector('.markdown-body');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.classList.add('markdown-body');
                aiMessage.innerHTML = '';
                aiMessage.appendChild(wrapper);
            }
            window.MarkdownRenderer.renderInto(wrapper, md);
        } else {
            aiMessage.textContent = text;
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;

        addCopyButton(aiMessage);
    }

    // 복사 버튼 추가 함수
    function addCopyButton(messageElement) {
        // remove legacy button version if present
        const legacyButton = messageElement.querySelector('button.copy-button');
        if (legacyButton) {
            legacyButton.remove();
        }

        let copyButton = messageElement.querySelector('[data-copy-button]');
        if (!copyButton) {
            copyButton = document.createElement('span');
            copyButton.setAttribute('data-copy-button', 'true');
            copyButton.textContent = '복사';
            copyButton.style.cssText = 'position: absolute; bottom: -20px; right: 10px; cursor: pointer; color: #8b4513;';
            messageElement.appendChild(copyButton);
        }

        copyButton.onclick = () => {
            const targetNode = messageElement.querySelector('.markdown-body') || messageElement;
            const selection = window.getSelection && window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                const range = document.createRange();
                range.selectNodeContents(targetNode);
                selection.addRange(range);
            }

            const textToCopy = targetNode.innerText || targetNode.textContent || '';
            navigator.clipboard.writeText(textToCopy)
                .then(() => console.log('Content copied to clipboard'))
                .catch(err => console.error('Failed to copy: ', err));
        };
    }

    // API 요청 함수
    async function makeAPIRequest(apiConfig, message) {
        const response = await fetch(apiConfig.url, {
            method: 'POST',
            headers: apiConfig.headers,
            body: apiConfig.body(message)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        return response;
    }

    // 스트리밍 응답 처리 함수
    async function handleStreamingResponse(response, updateCallback) {
        const reader = response.body.getReader();
        let accumulatedResponse = "";
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += new TextDecoder().decode(value);
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim() === '') continue;

                let jsonLine = line.startsWith('data: ') ? line.slice(6) : line;
                if (jsonLine.startsWith('event:')) continue;

                try {
                    const parsed = JSON.parse(jsonLine);
                    accumulatedResponse += extractResponseContent(parsed);
                    updateCallback(accumulatedResponse);
                } catch (e) {
                    console.warn('Incomplete JSON, buffering:', e);
                }
            }
        }

        return accumulatedResponse;
    }

    // 응답 내용 추출 함수
    function extractResponseContent(parsed) {
        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
            return parsed.choices[0].delta.content;
        } else if (parsed.event_type === 'text-generation' && parsed.text) {
            return parsed.text;
        }
        return '';
    }

    // 메시지 전송 함수
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage(message, true);
        userInput.value = '';

        try {
            const config = await getAPIConfig();
            updateAIMessage("답변을 생성 중입니다...");

            const response = await makeAPIRequest(config, message);
            let aiResponse;

            if (config.isStreaming) {
                aiResponse = await handleStreamingResponse(response, updateAIMessage);
            } else {
                const data = await response.json();
                aiResponse = extractNonStreamingResponse(data, config.model);
            }

            updateAIMessage(aiResponse);
            conversationHistory.push({role: "Chatbot", message: aiResponse});
            addModelNameToLastMessage(config.model);
        } catch (error) {
            console.error('Error:', error);
            updateAIMessage(`API 요청 중 오류가 발생했습니다: ${error.message}`);
        }
    }

    // API 설정 가져오기 함수
    async function getAPIConfig() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'cohereApiKey', 
                'mistralApiKey', 
                'geminiApiKey', 
                'geminiflashApiKey', 
                'groqApiKey',
                'cerebrasApiKey',  // Cerebras API 키 추가
                'cerebrasModel',   // Cerebras 모델 추가
                'selectedModel', 
                'instructions'
            ], function(result) {
                if (!result.cohereApiKey && !result.mistralApiKey && !result.geminiApiKey && 
                    !result.geminiflashApiKey && !result.groqApiKey && !result.cerebrasApiKey) {
                    throw new Error("API 키를 설정해주세요.");
                }
    
                const contextMessage = `현재 웹페이지의 내용: ${pageContent}`;
                const config = {
                    model: result.selectedModel,
                    isStreaming: true,
                    instructions: result.instructions ? result.instructions.join('\n') : ''
                };

                switch (result.selectedModel) {
                    case 'mistralSmall':
                        config.url = 'https://api.mistral.ai/v1/chat/completions';
                        config.headers = {
                            'Authorization': `Bearer ${result.mistralApiKey.trim()}`,
                            'Content-Type': 'application/json'
                        };
                        config.body = (msg) => JSON.stringify({
                            model: "mistral-small-latest",
                            messages: [{ role: "user", content: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.` }],
                            stream: true
                        });
                        break;
                    case 'groq':
                        config.url = 'https://api.groq.com/openai/v1/chat/completions';
                        config.headers = {
                            'Authorization': `Bearer ${result.groqApiKey.trim()}`,
                            'Content-Type': 'application/json',
                        };
                        config.body = (msg) => JSON.stringify({
                            "messages": [
                                ...conversationHistory.map(hist => ({
                                    role: hist.role.toLowerCase() === "user" ? "user" : "assistant",
                                    content: hist.message
                                })),
                                {
                                    "role": "user",
                                    "content": `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`
                                }
                            ],
                            "model": "llama-3.1-70b-versatile",
                            "temperature": 0.7,
                            "stream": true
                        });
                        break;
                    case 'gemini':
                    case 'geminiflash':
                        const apiKey = result.selectedModel === 'gemini' ? result.geminiApiKey : result.geminiflashApiKey;
                        config.url = `https://generativelanguage.googleapis.com/v1${result.selectedModel === 'geminiflash' ? 'beta' : ''}/models/${result.selectedModel === 'gemini' ? 'gemini-pro' : 'gemini-1.5-flash-latest'}:generateContent?key=${apiKey.trim()}`;
                        config.headers = { 'Content-Type': 'application/json' };
                        config.body = (msg) => JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`
                                }]
                            }],
                            generationConfig: { temperature: 0 }
                        });
                        config.isStreaming = false;
                        break;
                        // getAPIConfig 함수 내의 switch 문에 Cerebras 케이스 추가
                    case 'Cerebras':
                        if (!result.cerebrasApiKey) {
                            throw new Error("Cerebras API 키가 설정되지 않았습니다.");
                        }
                        
                        config.url = 'https://api.cerebras.ai/v1/chat/completions';
                        config.headers = {
                            'Authorization': `Bearer ${result.cerebrasApiKey}`,
                            'Content-Type': 'application/json'
                        };
                        
                        // 대화 기록 길이 제한
                        const maxHistoryLength = 5; // 최근 5개의 대화만 유지
                        const limitedHistory = conversationHistory.slice(-maxHistoryLength);
                        
                        config.body = (msg) => {
                            // 메시지 길이 체크
                            const fullMessage = `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}`;
                            const truncatedMessage = fullMessage.length > 7000 ? fullMessage.substring(0, 7000) : fullMessage;
                            
                            return JSON.stringify({
                                model: result.cerebrasModel || 'llama3.1-8b',
                                messages: [
                                    {
                                        role: "system",
                                        content: config.instructions
                                    },
                                    ...limitedHistory.map(hist => ({
                                        role: hist.role.toLowerCase() === "user" ? "user" : "assistant",
                                        content: hist.message
                                    })),
                                    {
                                        role: "user",
                                        content: truncatedMessage
                                    }
                                ],
                                stream: false,
                                temperature: 0.7,
                                max_completion_tokens: 1000,
                                top_p: 0.95
                            });
                        };
                        config.isStreaming = false;
                        break;
                    default: // cohere
                        config.url = 'https://api.cohere.com/v1/chat';
                        config.headers = {
                            'Authorization': `Bearer ${result.cohereApiKey.trim()}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        };
                        config.body = (msg) => JSON.stringify({
                            message: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`,
                            chat_history: conversationHistory,
                            stream: true,
                            temperature: 0.7
                        });
                }

                resolve(config);
            });
        });
    }

    // 비스트리밍 응답 추출 함수
    function extractNonStreamingResponse(data, model) {
        if (model === 'Cerebras') {
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                return data.choices[0].message.content;
            }
        } else if (model.startsWith('gemini')) {
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                return data.candidates[0].content.parts.map(part => part.text).join('');
            }
        }
        console.error("Unexpected API response format:", data);
        return "API 응답 형식이 예상과 다릅니다.";
    }

    // 마지막 메시지에 모델 이름 추가 함수
    function addModelNameToLastMessage(model) {
        const aiModelNameSpan = document.createElement('span');
        aiModelNameSpan.textContent = `(${model})`;
        aiModelNameSpan.style.cssText = 'margin-left: 10px; font-size: 0.9em; color: #666;';
        chatMessages.appendChild(aiModelNameSpan);
    }

    // 이벤트 리스너 설정
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
});

// 컨텐츠 스크립트 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContent") {
        sendResponse({content: document.body.innerText});
    }
    return true;
});