chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "summarizeFullPage",
    title: "전체 페이지 요약",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "fullSummary",
    title: "Full 요약",
    parentId: "summarizeFullPage",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "mediumSummary",
    title: "보고서형식 요약",
    parentId: "summarizeFullPage",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "shortSummary",
    title: "간단한 요약",
    parentId: "summarizeFullPage",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "summarizeSelection",
    title: "선택 영역 요약",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "translateToEnglish",
    title: "영어로 번역",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "translateToKorean",
    title: "한글로 번역",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab.id === chrome.tabs.TAB_ID_NONE) {
    console.error('Cannot send message to this tab');
    return;
  }

  let action = info.menuItemId;
  let summaryType = "";

  if (["fullSummary", "mediumSummary", "shortSummary"].includes(action)) {
    summaryType = action;
    action = "summarizeFullPage";
  }

  chrome.tabs.sendMessage(tab.id, { 
    action: action,
    summaryType: summaryType,
    text: info.selectionText
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
    } else {
      console.log('Message sent successfully');
    }
  });
});

function sendMessage(tabId, info) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to inject content script:', chrome.runtime.lastError.message);
    } else {
      const message = {
        action: info.menuItemId,
        text: info.selectionText
      };
      
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError.message);
        } else {
          console.log('Message sent successfully');
        }
      });
    }
  });
}
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

async function handleAPIRequest(url, headers, body, model) {
  const response = await fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (model === 'mistralSmall') {
    const reader = response.body.getReader();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new TextDecoder().decode(value);
      let jsonLine = chunk;
      if (jsonLine.startsWith('data: ')) {
        jsonLine = jsonLine.slice(6);
      }
      try {
        const parsed = JSON.parse(jsonLine);
        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
          result += parsed.choices[0].delta.content;
        }
      } catch (e) {
        console.warn('Incomplete JSON, buffering:', e);
      }
    }
    return result;
  } else {
    const data = await response.json();
    if (model === 'cohere') {
      return data.generations[0].text;
    } else if (model === 'geminiFlash') {
      return data.choices[0].message.content;
    } else if (model === 'groq') {
      return data.generations[0].text;
    }
  }
}


async function generateSummary(text, model, apiKey, summaryType, delay) {
  await new Promise(resolve => setTimeout(resolve, delay));

  let url = "";
  let headers = {};
  let body = {};

  if (model === "cohere") {
    url = "https://api.cohere.ai/generate";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "prompt": `Summarize the following text in ${summaryType} style:\n\n${text}`,
      "temperature": 0.3,
      "max_tokens": 200
    };
  } else if (model === "mistralSmall") {
    url = "https://api.mistral.ai/v1/engines/mistral-small-c4/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "prompt": `Summarize the following text in ${summaryType} style:\n\n${text}`,
      "temperature": 0.3,
      "max_tokens": 200,
      "stream": true
    };
  } else if (model === "geminiFlash") {
    url = "https://api.gemini.ai/v1/engines/gemini-flash/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "prompt": `Summarize the following text in ${summaryType} style:\n\n${text}`,
      "temperature": 0.3,
      "max_tokens": 200
    };
  } else if (model === "groq") {
    url = "https://api.groq.com/v1/generate";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "prompt": `Summarize the following text in ${summaryType} style:\n\n${text}`,
      "temperature": 0.3,
      "max_tokens": 200
    };
  }

  return handleAPIRequest(url, headers, body, model);
}

async function translateText(text, model, apiKey, targetLanguage, delay) {
  await new Promise(resolve => setTimeout(resolve, delay));

  let url = "";
  let headers = {};
  let body = {};

  if (model === "cohere") {
    url = "https://api.cohere.ai/translate";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "text": text,
      "target_language": targetLanguage
    };
  } else if (model === "mistralSmall") {
    url = "https://api.mistral.ai/v1/engines/mistral-small-c4/translations";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "text": text,
      "target_language": targetLanguage,
      "stream": true

    };
  } else if (model === "geminiFlash") {
    url = "https://api.gemini.ai/v1/engines/gemini-flash/translations";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "text": text,
      "target_language": targetLanguage
    };
  } else if (model === "groq") {
    url = "https://api.groq.com/v1/translate";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      "text": text,
      "target_language": targetLanguage
    };
  }

  return handleAPIRequest(url, headers, body, model);
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  const { action, text, summaryType } = request;

  chrome.storage.sync.get(['cohereApiKey', 'mistralApiKey', 'geminiApiKey', 'groqApiKey', 'selectedModel'], async (data) => {
    const { cohereApiKey, mistralApiKey, geminiApiKey, groqApiKey, selectedModel } = data;

    if (action === "summarizeFullPage" || action === "summarizeSelection") {
      const summary = await generateSummary(text, selectedModel, data[`${selectedModel}ApiKey`], summaryType, 1000);
      sendResponse({ summary });
    } else if (action === "translateToEnglish" || action === "translateToKorean") {
      const targetLanguage = action === "translateToEnglish" ? "en" : "ko";
      const translation = await translateText(text, selectedModel, data[`${selectedModel}ApiKey`], targetLanguage, 1000);
      sendResponse({ translation });
    }
  });

  return true;
});
