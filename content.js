// content.js
console.log('Content script loaded');

function getPageContent() {
  return document.body.innerText;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  
  if (request.action === "getPageContent") {
    sendResponse({content: getPageContent()});
  } else {
    switch (request.action) {
      case "summarizeFullPage":
        summarizeFullPage(request.summaryType);
        break;
      case "summarizeSelection":
        summarizeSelection(request.text);
        break;
      case "translateToEnglish":
        translate(request.text, "영어");
        break;
      case "translateToKorean":
        translate(request.text, "한국어");
        break;
    }
    sendResponse({received: true});
  }
  return true;
});

function summarizeFullPage(summaryType) {
  const fullText = document.body.innerText;
  let instruction = getSummaryInstruction(summaryType);
  sendToAI(fullText, instruction);
}

function summarizeSelection(text) {
  sendToAI(text, "선택한 텍스트를 요약해주세요.");
}

function translate(text, targetLanguage) {
  sendToAI(text, `이 텍스트를 ${targetLanguage}로 번역해주세요.`);
}

function getSummaryInstruction(summaryType) {
  const instructions = {
    fullSummary: "핵심 내용 추출다음 텍스트를 요약하여 가장 중요한 핵심 내용만 3가지 문장으로 나타내주세요.이 글의 주요 논점을 간결하게 요약해주세요. 강조하고 싶은 부분 지정이 글에서 '결론' 부분을 자세히 요약해주세요.텍스트에서 '문제점'과 '해결 방안'에 대한 내용을 중심으로 요약해주세요.마크다운 형식은 사용하지 않는다.",
    mediumSummary: "다음 웹페이지의 내용을 읽고, 알맞은 요약 형식을 선택한 후 그 형식에 맞춰 주요 내용을 요약해주세요. 그리고 해당 방식을 보고서 형식으로 요약해줘.",
    shortSummary: "간단히 요약해주세요. 가장 중요한 핵심만을 간결하게 담아주세요."
  };
  return instructions[summaryType] || instructions.shortSummary;
}

function updateProgress(message) {
  const progressText = document.getElementById('progressText');
  if (progressText) {
    progressText.textContent = message;
  }
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'summaryOverlay';
  overlay.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    width: 350px !important;
    max-height: 80% !important;
    background-color: #fff8e7 !important;
    border: 1px solid #d2b48c !important;
    border-radius: 15px !important;
    padding: 25px !important;
    box-shadow: 0 4px 15px rgba(78, 54, 41, 0.1) !important;
    z-index: 999999 !important;
    overflow-y: auto !important;
    font-family: Arial, sans-serif !important;
    color: #4e3629 !important;
    font-size: 16px !important;
  `;
  return overlay;
}

function removeExistingOverlay() {
  const existingOverlay = document.getElementById('summaryOverlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
}

async function sendToAI(text, instruction) {
  try {
      const result = await chrome.storage.sync.get([
          'cohereApiKey',
          'mistralApiKey',
          'geminiApiKey',
          'geminiflashApiKey',
          'groqApiKey',
          'cerebrasApiKey',
          'cerebrasModel',
          'selectedModel',
          'instructions'
      ]);

      const instructions = result.instructions || [];
      const combinedInstruction = instructions.join('\n') + '\n' + instruction;
      showLoading(combinedInstruction);
      updateProgress("API에 요청을 보내는 중...");

      // Cerebras API 키 체크
      if (!result.cerebrasApiKey && result.selectedModel === 'Cerebras') {
          throw new Error("Cerebras API 키가 설정되지 않았습니다.");
      }

      // 텍스트 길이 체크 및 처리
      if (result.selectedModel === 'Cerebras') {
          if (text.length > 8000) {
              updateProgress("긴 텍스트를 처리하는 중...");
              const chunks = splitText(text, 7000);
              let combinedResponse = '';
              
              for (const chunk of chunks) {
                  const chunkResponse = await processSingleChunk(chunk, instruction, result);
                  combinedResponse += chunkResponse + ' ';
                  updateProgress(`${chunks.indexOf(chunk) + 1}/${chunks.length} 청크 처리 완료`);
              }
              
              showResult(combinedResponse.trim());
              return;
          }
      }

      updateProgress("작업을 시작합니다...");

      const apiConfig = await getAPIConfig(result, combinedInstruction, text);
      
      // 디버깅을 위한 요청 내용 로깅
      console.log('API Request Config:', {
          url: apiConfig.url,
          headers: {...apiConfig.headers, Authorization: '[HIDDEN]'},
          body: JSON.parse(apiConfig.body)
      });

      const response = await fetch(apiConfig.url, {
          method: 'POST',
          headers: apiConfig.headers,
          body: apiConfig.body
      });

      if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error Response:', errorText);
          
          // 컨텍스트 길이 초과 에러 특별 처리
          if (errorText.includes('context_length_exceeded')) {
              updateProgress("텍스트가 너무 깁니다. 축소된 버전으로 다시 시도합니다...");
              return await sendToAI(text.substring(0, Math.floor(text.length * 0.8)), instruction);
          }
          
          throw new Error(`API 요청 실패 (${response.status}): ${errorText}`);
      }

      let aiResponse;
      if (apiConfig.isStreaming) {
          aiResponse = await handleStreamingResponse(response, result.selectedModel, updateAIMessage);
      } else {
          const data = await response.json();
          aiResponse = extractResponseContent(data, result.selectedModel);
      }

      showResult(aiResponse);
      addModelNameToLastMessage(result.selectedModel);

  } catch (error) {
      console.error('Error details:', error);
      
      // 사용자 친화적인 에러 메시지 표시
      let errorMessage = "API 요청 중 오류가 발생했습니다: ";
      if (error.message.includes('API key')) {
          errorMessage += "API 키가 올바르지 않거나 설정되지 않았습니다.";
      } else if (error.message.includes('context_length_exceeded')) {
          errorMessage += "텍스트가 너무 깁니다. 더 짧은 텍스트로 시도해주세요.";
      } else {
          errorMessage += error.message;
      }
      
      showResult(errorMessage);
  }
}

// 청크 처리를 위한 헬퍼 함수
async function processSingleChunk(chunk, instruction, result) {
  const apiConfig = await getAPIConfig(result, instruction, chunk);
  const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: apiConfig.headers,
      body: apiConfig.body
  });
  
  if (!response.ok) {
      throw new Error(`청크 처리 중 오류 발생 (${response.status})`);
  }
  
  const data = await response.json();
  return extractResponseContent(data, result.selectedModel);
}

async function handleStreamingResponse(response, model, updateCallback) {
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

          try {
              // Cohere 형식
              if (model === 'cohere' && line.startsWith('event:')) continue;
              
              // Groq 형식
              if (model === 'groq' && line.startsWith(':')) continue;
              
              // Cerebras 형식도 처리
              if (model === 'Cerebras' && line.startsWith('data: ')) {
                  let jsonLine = line.slice(6);
                  const parsed = JSON.parse(jsonLine);
                  const content = extractStreamContent(parsed, model);
                  if (content) {
                      accumulatedResponse += content;
                      updateCallback(accumulatedResponse);
                  }
                  continue;
              }
              
              let jsonLine = line.startsWith('data: ') ? line.slice(6) : line;
              const parsed = JSON.parse(jsonLine);
              const content = extractStreamContent(parsed, model);
              
              if (content) {
                  accumulatedResponse += content;
                  updateCallback(accumulatedResponse);
              }
          } catch (e) {
              console.warn(`Parsing error for ${model}:`, e);
          }
      }
  }

  return accumulatedResponse;
}

async function getAPIConfig(result, instruction, text) {
  return new Promise((resolve) => {
      const contextMessage = `현재 웹페이지의 내용: ${text}`;
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
                config.body = JSON.stringify({
                    model: "mistral-small-latest",
                    messages: [{ role: "user", content: `${config.instructions}\n${contextMessage}\n\n${instruction}` }],
                    stream: true
                });
                break;
            case 'gemini':
                config.url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${result.geminiApiKey.trim()}`;
                config.headers = { 'Content-Type': 'application/json' };
                config.body = JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${config.instructions}\n${contextMessage}\n\n${instruction}`
                        }]
                    }],
                    generationConfig: { temperature: 0 }
                });
                config.isStreaming = false;
                break;
            case 'geminiflash':
                config.url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${result.geminiflashApiKey.trim()}`;
                config.headers = {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': result.geminiflashApiKey.trim()
                };
                config.body = JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${config.instructions}\n${contextMessage}\n\n${instruction}`
                        }]
                    }],
                    generationConfig: { temperature: 0 }
                });
                config.isStreaming = false;
                break;
            case 'groq':
              config.url = 'https://api.groq.com/openai/v1/chat/completions';
              config.headers = {
                  'Authorization': `Bearer ${result.groqApiKey.trim()}`,
                  'Content-Type': 'application/json',
              };
              config.body = JSON.stringify({
                  "messages": [
                      {
                          "content": `${config.instructions}\n${contextMessage}\n\n${instruction}`,
                          "role": "user"
                      }
                  ],
                  "model": "llama-3.1-70b-versatile",
                  "stream": config.isStreaming // Groq API가 스트리밍을 지원하면 추가
              });
              // Groq API가 스트리밍을 지원하지 않는다면 다음 줄 추가
              // config.isStreaming = false;
              break;
              case 'Cerebras':
                const maxChunkLength = 7000; // 안전한 길이로 설정
                const chunks = splitText(`${contextMessage}\n\n${instruction}`, maxChunkLength);
                
                config.url = 'https://api.cerebras.ai/v1/chat/completions';
                config.headers = {
                    'Authorization': `Bearer ${result.cerebrasApiKey}`,
                    'Content-Type': 'application/json'
                };
                
                const selectedModel = result.cerebrasModel || 'llama3.1-8b';
                
                // 첫 번째 청크만 처리하도록 수정
                config.body = JSON.stringify({
                    model: selectedModel,
                    messages: [
                        {
                            role: "system",
                            content: config.instructions
                        },
                        {
                            role: "user",
                            content: chunks[0] // 첫 번째 청크만 사용
                        }
                    ],
                    stream: false,
                    temperature: 0.7,
                    max_completion_tokens: 1000,
                    top_p: 0.95
                });
                break;
            default: // cohere
                config.url = 'https://api.cohere.com/v1/chat';
                config.headers = {
                    'Authorization': `Bearer ${result.cohereApiKey.trim()}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                };
                config.body = JSON.stringify({
                    message: `${config.instructions}\n${contextMessage}\n\n${instruction}`,
                    stream: true,
                    temperature: 0.7
                });
        }

        resolve(config);
    });
}

function extractStreamContent(parsed, model) {
  if (model === 'Cerebras') {
      return parsed.choices?.[0]?.delta?.content || '';
  } else if (model === 'mistralSmall') {
      return parsed.choices?.[0]?.delta?.content || '';
  } else if (model.startsWith('gemini')) {
      return parsed.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  } else if (model === 'groq') {
      return parsed.choices?.[0]?.delta?.content || '';
  } else {
      return parsed.event_type === 'text-generation' ? parsed.text : '';
  }
}


function extractResponseContent(data, model) {
  if (model === 'Cerebras') {
      // Cerebras API 응답 형식에 맞게 처리
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
          return data.choices[0].message.content;
      }
      throw new Error("Unexpected Cerebras API response format");
  } else if (model.startsWith('gemini')) {
      return data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  } else if (model === 'groq') {
      return data.choices?.[0]?.message?.content || '';
  } else if (model === 'mistralSmall') {
      return data.choices?.[0]?.message?.content || '';
  } else {
      // cohere 또는 기타 모델의 경우
      if (data.generations && data.generations.length > 0) {
          return data.generations[0].text;
      }
  }
  console.error("Unexpected API response format:", data);
  return "API 응답 형식이 예상과 다릅니다.";
}



function showResult(result) {
  removeExistingOverlay();
  const overlay = createOverlay();
  const content = document.createElement('div');
  content.innerHTML = `
    <h2 style="margin-top: 0; margin-bottom: 20px; color: #2c3e50;">결과</h2>
    <div id="resultText" style="margin-bottom: 20px; line-height: 1.6; color: #444;">${result.replace(/\n/g, '<br>')}</div>
    <button id="closeOverlay">닫기</button>
    <button id="copyResult">복사</button>
    <span id="aiModelName"></span>
  `;
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  document.getElementById('closeOverlay').addEventListener('click', removeExistingOverlay);
  document.getElementById('copyResult').addEventListener('click', copyResultToClipboard);
}

function copyResultToClipboard() {
  const resultText = document.getElementById('resultText');
  if (resultText) {
    navigator.clipboard.writeText(resultText.innerText)
      .then(() => console.log('Content copied to clipboard'))
      .catch(err => console.error('Failed to copy: ', err));
  }
}

function showLoading(instruction) {
  removeExistingOverlay();
  const overlay = createOverlay();
  const content = document.createElement('div');
  content.innerHTML = `
    <h2 style="margin-top: 0; margin-bottom: 20px; color: #333;">작업 중...</h2>
    <p style="margin-bottom: 15px; color: #666;"><strong>현재 작업:</strong> ${instruction}</p>
    <div class="loader"></div>
    <p id="progressText" style="margin-top: 20px;">작업을 시작합니다...</p>
    <p id="partialResult"></p>
  `;
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  addStyles();
}

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .loader {
      border: 5px solid #f3f3f3;
      border-top: 5px solid #3498db;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    #partialResult {
      margin-top: 20px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
      color: #444;
    }
    #summaryOverlay div {
      line-height: 1.6;
      margin-bottom: 15px;
    }
    #summaryOverlay h2 {
      font-size: 1.4em;
      color: #2c3e50;
    }
    #summaryOverlay button {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 1em;
      transition: background-color 0.3s;
    }
    #summaryOverlay button:hover {
      background-color: #2980b9;
    }
    #aiModelName {
      margin-left: 10px;
      font-size: 0.9em;
      color: #666;
    }
  `;
  document.head.appendChild(style);
}

function addModelNameToLastMessage(model) {
  const aiModelSpan = document.createElement('span');
  aiModelSpan.textContent = `(${model})`;
  aiModelSpan.style.marginLeft = '10px';
  aiModelSpan.style.fontSize = '0.9em';
  aiModelSpan.style.color = '#666';
  document.getElementById('summaryOverlay').appendChild(aiModelSpan);
}

function updateAIMessage(text) {
    const aiMessage = document.getElementById('resultText');
    if (aiMessage) {
        aiMessage.innerHTML = text.replace(/\n/g, '<br>');
    }
}

// popup.js
document.addEventListener('DOMContentLoaded', function() {
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');
  let pageContent = '';
  let conversationHistory = [];

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
        
        try {
            const injectionResults = await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: getPageContent
            });
            
            if (injectionResults && injectionResults[0]) {
                pageContent = injectionResults[0].result;
                console.log("Page content updated via injection:", pageContent.substring(0, 100) + "...");
            }
        } catch (injectionError) {
            console.error('Script injection failed:', injectionError);
        }
    }
}

// 페이지 컨텐츠를 가져오는 함수
function getPageContent() {
    return document.body.innerText;
}

// 초기 페이지 컨텐츠 업데이트 및 주기적 업데이트 설정
updatePageContent();
setInterval(updatePageContent, 5000);
});

function splitText(text, maxLength) {
  const chunks = [];
  let currentChunk = '';
  
  // 문장 단위로 분할
  const sentences = text.split(/[.!?]+/);
  
  for (const sentence of sentences) {
      if ((currentChunk + sentence).length < maxLength) {
          currentChunk += sentence + '. ';
      } else {
          chunks.push(currentChunk);
          currentChunk = sentence + '. ';
      }
  }
  
  if (currentChunk) {
      chunks.push(currentChunk);
  }
  
  return chunks;
}