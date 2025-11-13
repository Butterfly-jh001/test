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
    fullSummary: "핵심 내용 추출다음 텍스트를 요약하여 가장 중요한 핵심 내용만 문장으로 나타내주세요.이 글의 주요 논점을 간결하게 요약해주세요. 강조하고 싶은 부분 지정이 글에서 '결론' 부분을 자세히 요약해주세요.텍스트에서 '문제점'과 '해결 방안'에 대한 내용을 중심으로 요약해주세요.마크다운 형식은 사용하지 않는다.",
    mediumSummary: "다음 웹페이지의 내용을 읽고, 알맞은 요약 형식을 선택한 후 그 형식에 맞춰 주요 내용을 요약해주세요. 그리고 해당 방식을 보고서 형식으로 요약해줘.",
    shortSummary: "간단히 요약해주세요. 가장 중요한 핵심만을 간결하게 담아주세요.",
    generalSummary: "요약해주세요"   // ✅ 추가
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

// 네이버 뉴스 본문 자동 선택 함수 추가
function autoSelectNewsContent() {
    // 네이버 뉴스 본문 요소 선택자
    const newsContentSelector = '#newsct_article';
    const newsContent = document.querySelector(newsContentSelector);
    
    if (newsContent) {
        // 기존 선택 초기화
        window.getSelection().removeAllRanges();
        
        // 새로운 Range 객체 생성
        const range = document.createRange();
        range.selectNodeContents(newsContent);
        
        // 선택 영역 설정
        const selection = window.getSelection();
        selection.addRange(range);
        
        return true;
    }
    return false;
}

// 전역 변수로 재시도 플래그 추가
let retryAttempted = false;
let lastMarkdownResult = "";

async function sendToAI(text, instruction) {
    try {
        const result = await chrome.storage.sync.get([
            'cohereApiKey', 'mistralApiKey', 'geminiApiKey', 
            'geminiflashApiKey', 'groqApiKey', 'cerebrasApiKey', 
            'cerebrasModel', 'selectedModel', 'instructions', 'google20FlashApiKey'
        ]);

        const instructions = result.instructions || [];
        const combinedInstruction = instructions.join('\n') + '\n' + instruction;
        showLoading(combinedInstruction);
        updateProgress("API에 요청을 보내는 중...");

        if (result.selectedModel === 'gemini' || result.selectedModel === 'geminiflash') {
            try {
                const apiConfig = await getAPIConfig(result, instruction, text);
                const response = await fetch(apiConfig.url, {
                    method: 'POST',
                    headers: apiConfig.headers,
                    body: apiConfig.body
                });

                if (!response.ok) {
                    throw new Error(`API 요청 실패 (${response.status})`);
                }

                const data = await response.json();
                
                if (data.error || !data.candidates || data.candidates.length === 0) {
                    // 첫 시도에서 실패한 경우
                    if (!retryAttempted) {
                        retryAttempted = true;
                        const newsContent = document.querySelector('#newsct_article');
                        if (newsContent) {
                            window.getSelection().removeAllRanges();
                            const range = document.createRange();
                            range.selectNodeContents(newsContent);
                            window.getSelection().addRange(range);
                            
                            const selectedText = window.getSelection().toString();
                            if (selectedText) {
                                // 본문 선택 후 다시 시도
                                await sendToAI(selectedText, instruction);
                                return;
                            }
                        }
                        throw new Error('뉴스 본문을 찾을 수 없습니다.');
                    } else {
                        // 본문 선택 후에도 실패한 경우
                        throw new Error('요약 작업을 수행할 수 없습니다. API 접근이 제한되었습니다.');
                    }
                }

                // API 응답 성공
                const aiResponse = extractResponseContent(data, result.selectedModel);
                showResult(aiResponse);
                addModelNameToLastMessage(result.selectedModel);
                retryAttempted = false; // 성공 시 플래그 초기화

            } catch (geminiError) {
                console.error('Gemini API 오류:', geminiError);
                
                // 첫 시도에서 실패한 경우
                if (!retryAttempted) {
                    retryAttempted = true;
                    const newsContent = document.querySelector('#newsct_article');
                    if (newsContent) {
                        window.getSelection().removeAllRanges();
                        const range = document.createRange();
                        range.selectNodeContents(newsContent);
                        window.getSelection().addRange(range);
                        
                        const selectedText = window.getSelection().toString();
                        if (selectedText) {
                            // 본문 선택 후 다시 시도
                            await sendToAI(selectedText, instruction);
                            return;
                        } else {
                            showResult("뉴스 본문을 찾을 수 없습니다. 직접 본문을 선택해주세요.");
                        }
                    } else {
                        showResult(`요약할 수 없습니다: ${geminiError.message}`);
                    }
                } else {
                    // 본문 선택 후에도 실패한 경우
                    showResult("API 접근이 제한되어 요약을 완료할 수 없습니다. 나중에 다시 시도해주세요.");
                }
            }
        } else {
            // 다른 모델들의 처리 로직
            switch (result.selectedModel) {
                case 'groq':
                    const maxChunkLength = 20000;  // 3000 → 20K자로 증가 (토큰 ≈ 5K, 여유롭게)
                    if (text.length > maxChunkLength) {
                        updateProgress("텍스트가 길어 청크로 분할 처리합니다...");
                        const chunks = splitText(text, maxChunkLength);
                        let fullResponse = "";  // 모든 청크 응답 누적
                        
                        for (let i = 0; i < chunks.length; i++) {
                            updateProgress(`청크 ${i + 1}/${chunks.length} 처리 중...`);
                            const chunkInstruction = chunks.length > 1 
                                ? `${instruction} (이 부분: 청크 ${i + 1}/${chunks.length})` 
                                : instruction;
                            
                            const apiConfig = await getAPIConfig(result, chunkInstruction, chunks[i]);
                            const response = await fetch(apiConfig.url, {
                                method: 'POST',
                                headers: apiConfig.headers,
                                body: apiConfig.body
                            });
                            
                            if (!response.ok) {
                                throw new Error(`청크 ${i + 1} 처리 실패 (${response.status}): ${await response.text()}`);
                            }
                            
                            const chunkResponse = await handleStreamingResponse(response, 'groq', (partial) => {
                                // 부분 응답 시 UI 업데이트 (선택)
                                if (i === 0) {
                                    updateAIMessage(partial);
                                }
                            });
                            
                            if (chunks.length > 1) {
                                fullResponse += `\n\n--- 청크 ${i + 1} 요약 ---\n${chunkResponse}`;
                            } else {
                                fullResponse = chunkResponse;
                            }
                        }
                        
                        const finalResponse = chunks.length > 1 
                            ? `전체 요약 (${chunks.length}개 청크):${fullResponse}` 
                            : fullResponse;
                        
                        showResult(finalResponse);
                        addModelNameToLastMessage('groq');
                        return;
                    }
                    break;

                case 'Cerebras':
                    if (text.length > 8000) {
                        const chunks = splitText(text, 7000);
                        let responses = [];
                        for (let i = 0; i < chunks.length; i++) {
                            updateProgress(`청크 처리 중 ${i + 1}/${chunks.length}`);
                            const chunkResponse = await processSingleChunk(chunks[i], instruction, result);
                            responses.push(chunkResponse);
                        }
                        showResult(responses.join('\n\n'));
                        addModelNameToLastMessage('Cerebras');
                        return;
                    }
                    break;
            }

            // 일반적인 API 처리
            const apiConfig = await getAPIConfig(result, combinedInstruction, text);
            console.log('API Config:', { url: apiConfig.url, isStreaming: apiConfig.isStreaming, model: result.selectedModel });
            
            const response = await fetch(apiConfig.url, {
                method: 'POST',
                headers: apiConfig.headers,
                body: apiConfig.body
            });

            // 응답 헤더 확인
            const contentType = response.headers.get('content-type');
            console.log('응답 헤더:', {
                status: response.status,
                contentType: contentType,
                isStreaming: apiConfig.isStreaming,
                model: result.selectedModel
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API 요청 실패:', response.status, errorText);
                
                // 403 에러인 경우 API 키 문제 (가이드에서 언급한 일반 오류)
                if (response.status === 403) {
                    throw new Error(`API 키 오류 (403). API 키가 올바른지 확인해주세요. 원본 에러: ${errorText}`);
                }
                
                // 404 에러인 경우 모델 이름 문제일 수 있음
                if (response.status === 404 && result.selectedModel === 'gemini20Flash') {
                    throw new Error(`모델을 찾을 수 없습니다 (404). 모델 이름이 올바른지 확인해주세요. API 문서를 참조하여 올바른 모델 이름을 사용하세요. 원본 에러: ${errorText}`);
                }
                
                // 400 에러인 경우 요청 형식 문제일 수 있음
                if (response.status === 400) {
                    throw new Error(`잘못된 요청 (400). 요청 본문 형식을 확인해주세요. 원본 에러: ${errorText}`);
                }
                
                // 429 에러인 경우 쿼터 초과 (가이드에서 언급한 일반 오류)
                if (response.status === 429) {
                    try {
                        const errorData = JSON.parse(errorText);
                        const errorMsg = errorData[0]?.error?.message || errorText;
                        const retryDelay = errorData[0]?.error?.details?.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')?.retryDelay || '22s';
                        throw new Error(`요청 제한 초과 (429). ${errorMsg} ${retryDelay} 후 재시도해주세요.`);
                    } catch {
                        throw new Error(`요청 제한 초과 (429). 잠시 후 재시도해주세요. 원본 에러: ${errorText}`);
                    }
                }
                
                throw new Error(`API 요청 실패 (${response.status}): ${errorText}`);
            }

            let aiResponse;
            
            // Content-Type 확인하여 스트리밍 여부 결정
            const isActuallyStreaming = contentType && (
                contentType.includes('text/event-stream') || 
                contentType.includes('application/x-ndjson') ||
                apiConfig.isStreaming
            );
            
            if (isActuallyStreaming) {
                console.log('스트리밍 응답 처리 시작, Content-Type:', contentType);
                try {
                    aiResponse = await handleStreamingResponse(response, result.selectedModel, updateAIMessage);
                    console.log('스트리밍 응답 완료, 길이:', aiResponse?.length || 0);
                    if (!aiResponse || aiResponse.trim() === '') {
                        // 스트리밍이 비어있으면 비스트리밍으로 재시도
                        console.warn('스트리밍 응답이 비어있습니다. 비스트리밍으로 재시도할 수 없습니다 (이미 소비됨).');
                        throw new Error('스트리밍 응답이 비어있습니다. API 응답 형식을 확인해주세요. 콘솔 로그를 확인하세요.');
                    }
                } catch (streamError) {
                    console.error('스트리밍 처리 중 에러:', streamError);
                    throw streamError;
                }
            } else {
                // 비스트리밍 응답 처리
                console.log('비스트리밍 응답 처리 시작, Content-Type:', contentType);
                try {
                    const data = await response.json();
                    console.log('비스트리밍 응답 데이터:', data);
                    
                    // 에러 확인
                    if (data.error) {
                        console.error('API 응답에 에러 포함:', data.error);
                        throw new Error(`API 에러: ${data.error.message || JSON.stringify(data.error)}`);
                    }
                    
                    aiResponse = extractResponseContent(data, result.selectedModel);
                    console.log('추출된 응답:', aiResponse?.substring(0, 100));
                } catch (jsonError) {
                    console.error('비스트리밍 응답 처리 중 에러:', jsonError);
                    throw new Error(`응답 파싱 실패: ${jsonError.message}`);
                }
            }

            if (!aiResponse || aiResponse.trim() === '') {
                throw new Error('응답이 비어있습니다.');
            }

            showResult(aiResponse);
            addModelNameToLastMessage(result.selectedModel);
        }
    } catch (error) {
        console.error('Error in sendToAI:', error);
        showResult(`오류가 발생했습니다: ${error.message}`);
    } finally {
        // API 요청이 성공한 경우에만 플래그를 초기화하도록 제거
        // retryAttempted는 성공 시에만 초기화되며, 실패 시에는 유지됨
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
  const decoder = new TextDecoder();
  let accumulatedResponse = "";
  let buffer = "";
  let hasReceivedData = false;
  let rawChunks = [];
  let processedChunks = 0;
  let totalBytes = 0;

  console.log(`스트리밍 응답 처리 시작 (모델: ${model})`);
  console.log('Content-Type:', response.headers.get('content-type'));

  try {
      while (true) {
          const { done, value } = await reader.read();
          if (done) {
              console.log('스트리밍 완료:', {
                  hasReceivedData,
                  accumulatedLength: accumulatedResponse.length,
                  totalBytes,
                  processedChunks,
                  bufferLength: buffer.length
              });
              // 버퍼에 남은 데이터 처리 시도
              if (buffer.trim() && (model.startsWith('gemini') || model === 'gemini20Flash')) {
                  console.log('버퍼에 남은 데이터 처리:', buffer.substring(0, 500));
                  try {
                      const finalResult = processGeminiStream(buffer, model, accumulatedResponse, updateCallback);
                      if (finalResult.hasNewData) {
                          accumulatedResponse = finalResult.accumulatedResponse;
                          hasReceivedData = true;
                      }
                  } catch (e) {
                      console.warn('버퍼 처리 실패:', e);
                  }
              }
              break;
          }

          totalBytes += value.length;
          const chunk = decoder.decode(value, { stream: true });
          
          // 원시 청크 저장 (디버깅용, 최대 10개)
          if (rawChunks.length < 10) {
              rawChunks.push({
                  index: rawChunks.length,
                  length: chunk.length,
                  preview: chunk.substring(0, 200),
                  full: chunk.substring(0, 1000)
              });
          }
          
          buffer += chunk;
          processedChunks++;
          
          // Gemini의 경우 JSON 객체 단위로 파싱 시도
          if (model.startsWith('gemini') || model === 'gemini20Flash') {
              const processResult = processGeminiStream(buffer, model, accumulatedResponse, updateCallback);
              if (processResult.processed) {
                  buffer = processResult.remainingBuffer;
                  if (processResult.hasNewData) {
                      hasReceivedData = true;
                      accumulatedResponse = processResult.accumulatedResponse;
                  }
              }
          } else {
              // 다른 모델들은 기존 방식 사용
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine === '') continue;
                  
                  try {
                      if (model === 'cohere' && trimmedLine.startsWith('event:')) continue;
                      if (model === 'groq' && trimmedLine.startsWith(':')) continue;
                      
                      let jsonLine = trimmedLine.startsWith('data: ') ? trimmedLine.slice(6).trim() : trimmedLine;
                      if (jsonLine === '[DONE]' || jsonLine === '') continue;
                      
                      const parsed = JSON.parse(jsonLine);
                      const content = extractStreamContent(parsed, model);
                      
                      if (content) {
                          hasReceivedData = true;
                          accumulatedResponse += content;
                          updateCallback(accumulatedResponse);
                      }
                  } catch (e) {
                      // 파싱 에러 무시
                  }
              }
          }
      }
  } catch (error) {
      console.error('스트리밍 응답 처리 중 에러:', error);
      console.error('수신된 원시 청크:', rawChunks.slice(0, 3));
      console.error('현재 버퍼:', buffer.substring(0, 1000));
      throw error;
  }

  if (!hasReceivedData && accumulatedResponse === '') {
      console.error('스트리밍 응답에서 데이터를 수신하지 못했습니다.');
      console.error('통계:', {
          totalBytes,
          processedChunks,
          bufferLength: buffer.length,
          rawChunksCount: rawChunks.length
      });
      
      if (rawChunks.length > 0) {
          console.error('원시 응답 데이터 샘플:');
          rawChunks.slice(0, 5).forEach((chunk, idx) => {
              console.error(`청크 ${chunk.index}:`, chunk.preview);
          });
          console.error('첫 번째 청크 전체:', rawChunks[0].full);
      }
      
      if (buffer) {
          console.error('최종 버퍼 내용:', buffer);
      }
      
      throw new Error('스트리밍 응답에서 데이터를 수신하지 못했습니다. 콘솔의 원시 응답 데이터를 확인해주세요.');
  }

  console.log('최종 응답 길이:', accumulatedResponse.length);
  return accumulatedResponse;
}

// Gemini 스트리밍 처리 헬퍼 함수
function processGeminiStream(buffer, model, currentResponse, updateCallback) {
  let remainingBuffer = buffer;
  let accumulatedResponse = currentResponse;
  let hasNewData = false;
  let processed = false;
  
  // 여러 줄에 걸친 JSON도 처리할 수 있도록 시도
  // 먼저 완전한 JSON 객체를 찾기
  let braceCount = 0;
  let startIdx = -1;
  let jsonStrings = [];
  
  // buffer에서 완전한 JSON 객체 추출
  for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === '{') {
          if (braceCount === 0) startIdx = i;
          braceCount++;
      } else if (buffer[i] === '}') {
          braceCount--;
          if (braceCount === 0 && startIdx !== -1) {
              // 완전한 JSON 객체 발견
              let jsonStr = buffer.substring(startIdx, i + 1);
              jsonStrings.push(jsonStr);
              startIdx = -1;
          }
      }
  }
  
  // 완전한 JSON 객체들을 파싱
  if (jsonStrings.length > 0) {
      processed = true;
      let lastProcessedIdx = 0;
      
      for (const jsonStr of jsonStrings) {
          try {
              // data: 접두사 제거
              let cleanJson = jsonStr.trim();
              if (cleanJson.startsWith('data:')) {
                  cleanJson = cleanJson.replace(/^data:\s*/, '').trim();
              }
              
              if (cleanJson === '' || cleanJson === '[DONE]') continue;
              
              const parsed = JSON.parse(cleanJson);
              
              // 에러 확인
              if (parsed.error) {
                  console.error('Gemini API 에러:', parsed.error);
                  throw new Error(`Gemini API 에러: ${parsed.error.message || JSON.stringify(parsed.error)}`);
              }
              
              // 텍스트 추출
              const content = extractStreamContent(parsed, model);
              if (content && content.length > 0) {
                  hasNewData = true;
                  accumulatedResponse += content;
                  updateCallback(accumulatedResponse);
                  console.log('Gemini 콘텐츠 추가:', content.substring(0, 50) + '...', `(전체: ${accumulatedResponse.length}자)`);
              } else if (parsed.candidates && parsed.candidates.length > 0) {
                  // 후보는 있지만 텍스트가 없는 경우 로그
                  const candidate = parsed.candidates[0];
                  if (candidate.finishReason) {
                      console.log('Gemini 응답 완료:', candidate.finishReason);
                  }
              }
          } catch (parseError) {
              // JSON 파싱 실패 시 로그 (첫 몇 개만)
              if (jsonStrings.indexOf(jsonStr) < 3) {
                  console.warn('JSON 파싱 실패:', parseError.message);
                  console.warn('시도한 JSON:', jsonStr.substring(0, 200));
              }
          }
      }
      
      // 처리된 부분 제거
      if (jsonStrings.length > 0) {
          const lastJson = jsonStrings[jsonStrings.length - 1];
          const lastJsonEnd = buffer.lastIndexOf(lastJson) + lastJson.length;
          remainingBuffer = buffer.substring(lastJsonEnd);
          
          // 남은 버퍼에서 불완전한 JSON 시작 부분만 남기기
          const incompleteStart = remainingBuffer.indexOf('{');
          if (incompleteStart > 0) {
              remainingBuffer = remainingBuffer.substring(incompleteStart);
          } else if (incompleteStart === -1) {
              remainingBuffer = '';
          }
      }
  } else {
      // 완전한 JSON이 없으면 라인 단위로 처리 시도
      const lines = buffer.split('\n');
      if (lines.length > 1) {
          processed = true;
          remainingBuffer = lines.pop() || '';
          
          for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine === '') continue;
              
              try {
                  let jsonLine = trimmedLine;
                  if (jsonLine.startsWith('data: ')) {
                      jsonLine = jsonLine.slice(6).trim();
                  }
                  if (jsonLine === '[DONE]' || jsonLine === '') continue;
                  
                  const parsed = JSON.parse(jsonLine);
                  
                  if (parsed.error) {
                      console.error('Gemini API 에러:', parsed.error);
                      throw new Error(`Gemini API 에러: ${parsed.error.message || JSON.stringify(parsed.error)}`);
                  }
                  
                  const content = extractStreamContent(parsed, model);
                  if (content && content.length > 0) {
                      hasNewData = true;
                      accumulatedResponse += content;
                      updateCallback(accumulatedResponse);
                  }
              } catch (e) {
                  // 파싱 에러 무시
              }
          }
      }
  }
  
  return {
      processed,
      remainingBuffer,
      accumulatedResponse,
      hasNewData
  };
}


async function getAPIConfig(result, instruction, text) {
  return new Promise((resolve) => {
      const contextMessage = `현재 웹페이지의 내용: ${text}`;
      const config = {
          model: result.selectedModel,
          isStreaming: true,
          instructions: result.instructions ? result.instructions.join('\n') : ''
      };

      // Cerebras API 설정
      if (result.selectedModel === 'Cerebras') {
          config.url = 'https://api.cerebras.ai/v1/chat/completions';
          config.headers = {
              'Authorization': `Bearer ${result.cerebrasApiKey}`,
              'Content-Type': 'application/json'
          };
          
          const selectedModel = result.cerebrasModel || 'llama-3.3-70b';
          
          config.body = JSON.stringify({
              model: selectedModel,
              messages: [
                  {
                      role: "system",
                      content: config.instructions
                  },
                  {
                      role: "user",
                      content: `${contextMessage}\n\n${instruction}`
                  }
              ],
              stream: false,
              temperature: 0.7,
              max_completion_tokens: 2000,
              top_p: 0.95
          });
          
          // Cerebras는 스트리밍을 비활성화
          config.isStreaming = false;
      }

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
            case 'gemini20Flash': // New case
                const apiKey = result.google20FlashApiKey?.trim();
                if (!apiKey) {
                    throw new Error('Gemini 2.0 Flash API 키가 설정되지 않았습니다.');
                }
                // 모델 이름: 무료 티어에서 안정적으로 작동하는 gemini-2.0-flash 사용
                // gemini-2.0-flash-exp는 실험 모델로 무료 티어 쿼터 제한이 매우 낮음 (429 에러 발생)
                // 사용자가 원하는 모델 이름으로 설정 가능하도록 함
                const modelName = result.gemini20FlashModelName || 'gemini-2.0-flash';
                config.url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}`;
                config.headers = {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                };
                // 요청 본문 형식: Chrome 확장 가이드에 따라 role 필드 포함 (권장)
                const requestBody = {
                    contents: [{
                        role: "user",  // 가이드 예시에 따라 명시적으로 포함
                        parts: [{
                            text: `${config.instructions}\n${contextMessage}\n\n${instruction}`
                        }]
                    }],
                    generationConfig: { 
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 8192
                    }
                };
                config.body = JSON.stringify(requestBody);
                config.isStreaming = true;
                config.modelName = modelName; // 디버깅용
                console.log('Gemini 20 Flash 요청:', { 
                    model: modelName, 
                    url: config.url.substring(0, 100) + '...',
                    bodyPreview: JSON.stringify(requestBody).substring(0, 200)
                });
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
                              "role": "system",
                              "content": "Please be concise and focused in your responses."
                          },
                          { // For Groq, the 'text' variable (original full text) is used directly as per existing logic.
                              "content": `${config.instructions}\n${text}\n\n${instruction}`,
                              "role": "user"
                          }
                      ],
                      "model": "llama-3.3-70b-versatile",
                      "stream": true,
                      "max_completion_tokens": 1000,
                      "temperature": 0.7
                  });
                  break;
              case 'Cerebras':
                const maxChunkLength = 7000; // 안전한 길이로 설정
                const chunks = splitText(`${contextMessage}\n\n${instruction}`, maxChunkLength);
                
                config.url = 'https://api.cerebras.ai/v1/chat/completions';
                config.headers = {
                    'Authorization': `Bearer ${result.cerebrasApiKey}`,
                    'Content-Type': 'application/json'
                };
                
                const selectedModel = result.cerebrasModel || 'llama-3.3-70b';
                
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
  } else if (model.startsWith('gemini') || model === 'gemini20Flash') {
      // Gemini 스트리밍 응답: 각 청크는 새로운 텍스트 조각을 포함
      try {
          // candidates 배열 확인
          if (!parsed.candidates || !Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
              console.warn('Gemini 응답에 candidates가 없음:', parsed);
              return '';
          }
          
          const candidate = parsed.candidates[0];
          
          // content가 있는지 확인
          if (!candidate.content) {
              // content가 없는 경우 (예: 후보가 아직 생성 중)
              return '';
          }
          
          // parts 배열 확인
          const parts = candidate.content.parts;
          if (!parts || !Array.isArray(parts) || parts.length === 0) {
              console.warn('Gemini 응답에 parts가 없음:', candidate);
              return '';
          }
          
          // 모든 parts에서 텍스트 추출
          const text = parts
              .map(part => part.text || '')
              .filter(text => text !== '')
              .join('');
          
          return text;
      } catch (error) {
          console.error('extractStreamContent 에러 (Gemini):', error, 'parsed:', parsed);
          return '';
      }
  } else if (model === 'groq') {
      return parsed.choices?.[0]?.delta?.content || '';
  } else {
      return parsed.event_type === 'text-generation' ? parsed.text : '';
  }
}


function extractResponseContent(data, model) {
  if (model === 'Cerebras') {
      if (data.choices && data.choices.length > 0) {
          // Cerebras API가 스트리밍 모드가 아닐 때
          if (data.choices[0].message) {
              return data.choices[0].message.content;
          }
          // 스트리밍 모드일 때
          if (data.choices[0].delta && data.choices[0].delta.content) {
              return data.choices[0].delta.content;
          }
      }
      console.error("Unexpected Cerebras API response format:", data);
      return "Cerebras API 응답을 처리할 수 없습니다.";
  }
  // 다른 모델들의 처리 로직은 유지
  if (model.startsWith('gemini')) {
      return data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  } else if (model === 'groq') {
      return data.choices?.[0]?.message?.content || '';
  } else if (model === 'mistralSmall') {
      return data.choices?.[0]?.message?.content || '';
  } else {
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
    <div id="resultText" class="markdown-body" style="margin-bottom: 20px; line-height: 1.6; color: #444;"></div>
    <button id="closeOverlay">닫기</button>
    <button id="copyResult">복사</button>
    <span id="aiModelName"></span>
  `;
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  if (window.MarkdownRenderer) {
    window.MarkdownRenderer.ensureStylesInjected();
    lastMarkdownResult = result || "";
    window.MarkdownRenderer.renderInto(document.getElementById('resultText'), lastMarkdownResult);
  } else {
    const resultDiv = document.getElementById('resultText');
    resultDiv.textContent = result;
  }

  document.getElementById('closeOverlay').addEventListener('click', removeExistingOverlay);
  document.getElementById('copyResult').addEventListener('click', copyResultToClipboard);
}

function copyResultToClipboard() {
  const targetNode =
    document.getElementById('resultText') ||
    document.getElementById('partialResult');

  const selection = window.getSelection && window.getSelection();
  if (targetNode && selection) {
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(targetNode);
    selection.addRange(range);
  }

  const textToCopy =
    (targetNode && (targetNode.innerText || targetNode.textContent)) ||
    lastMarkdownResult ||
    "";

  navigator.clipboard.writeText(textToCopy)
    .then(() => console.log('Content copied to clipboard'))
    .catch(err => console.error('Failed to copy: ', err));
}

function showLoading(instruction) {
  removeExistingOverlay();
  const overlay = createOverlay();
  const content = document.createElement('div');
  content.innerHTML = `
    <h2 style="margin-top: 0; margin-bottom: 20px; color: #333;">작업 중...</h2>
    <p style="margin-bottom: 15px; color: #666;"><strong>현재 작업:</strong> ${instruction}</p>
    <div class="loader"></div>
    <div id="partialResult" class="markdown-body"></div>
    <p id="progressText" style="margin-top: 20px;">작업을 시작합니다...</p>
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
      word-break: break-word;
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
  const overlayEl = document.getElementById('summaryOverlay');
  if (overlayEl) overlayEl.appendChild(aiModelSpan);
}

function updateAIMessage(text) {
    const aiMessage = document.getElementById('resultText');
    const partial = document.getElementById('partialResult');
    lastMarkdownResult = text || "";
    if (aiMessage) {
        if (window.MarkdownRenderer) {
          window.MarkdownRenderer.ensureStylesInjected();
          window.MarkdownRenderer.renderInto(aiMessage, lastMarkdownResult);
        } else {
          aiMessage.textContent = text;
        }
    } else if (partial) {
        if (window.MarkdownRenderer) {
          window.MarkdownRenderer.ensureStylesInjected();
          window.MarkdownRenderer.renderInto(partial, lastMarkdownResult);
        } else {
          partial.textContent = text;
        }
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
//updatePageContent();
//setInterval(updatePageContent, 5000);
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