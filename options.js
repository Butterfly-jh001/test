document.addEventListener('DOMContentLoaded', function() {
  var cohereApiKeyInput = document.getElementById('cohereApiKey');
  var mistralApiKeyInput = document.getElementById('mistralApiKey');
  var geminiApiKeyInput = document.getElementById('geminiApiKey');
  var geminiflashApiKeyInput = document.getElementById('geminiflashApiKey');
  var groqApiKeyInput = document.getElementById('groqApiKey');
  var ollamaApiKeyInput = document.getElementById('ollamaApiKey');
  var ollamaModelNameInput = document.getElementById('ollamaModelName');
  var cerebrasApiKeyInput = document.getElementById('cerebrasApiKey');
  var cerebrasModelRadios = document.querySelectorAll('input[name="cerebrasModel"]');
  var google20FlashApiKeyInput = document.getElementById('google20FlashApiKey');

  var aiModelSelect = document.getElementById('aiModel');
  console.log('Debug: aiModelSelect element:', aiModelSelect);
  console.log('Debug: aiModelSelect.value (selected option on load):', aiModelSelect.value);
  console.log('Debug: aiModelSelect.innerHTML (all options):', aiModelSelect.innerHTML);
  var saveButton = document.getElementById('save');
  var status = document.getElementById('status');

  // 언어 선택 요소
const languageSelect = document.getElementById('language');

// 저장된 언어 설정 불러오기
chrome.storage.sync.get('language', function(data) {
    if (data.language) {
        languageSelect.value = data.language;
    }
});

// 언어 변경 시 저장
languageSelect.addEventListener('change', function() {
    chrome.storage.sync.set({ language: this.value }, function() {
        // 언어 변경 후 페이지 새로고침
        location.reload();
    });
});

// 페이지 로드 시 언어 적용
function applyLanguage() {
    chrome.storage.sync.get('language', function(data) {
        const lang = data.language || 'ko'; // 기본값은 한국어
        
        const translations = {
            ko: {
                title: 'AI 요약 확장 프로그램 설정',
                aiModelLabel: 'AI 모델 선택:',
                saveButton: '저장',
                apiKeyPlaceholder: 'API 키를 입력하세요',
                instructionLabel: 'Instruction:',
                instructionPlaceholder: 'Instruction을 입력하세요',
                addInstruction: 'Instruction 추가',
                deleteInstruction: 'Instruction 삭제',
                languageLabel: '언어 설정 (Language Setting):',
                statusSaved: '설정이 저장되었습니다.',
                apiKeyGoogle20Flash: 'Google 2.0 플래시 API 키:',
                apiKeyGoogle20FlashPlaceholder: 'Google 2.0 플래시 API 키를 입력하세요',
            },
            en: {
                title: 'AI Summary Extension Settings',
                aiModelLabel: 'Select AI Model:',
                saveButton: 'Save',
                apiKeyPlaceholder: 'Enter API Key',
                instructionLabel: 'Instruction:',
                instructionPlaceholder: 'Enter Instruction',
                addInstruction: 'Add Instruction',
                deleteInstruction: 'Delete Instruction',
                languageLabel: 'Language Setting (언어 설정):',
                statusSaved: 'Settings saved successfully.',
                apiKeyGoogle20Flash: 'Google 2.0 Flash API Key:',
                apiKeyGoogle20FlashPlaceholder: 'Enter Google 2.0 Flash API Key',
            }
        };

        // 텍스트 요소들 업데이트
        document.title = translations[lang].title;
        document.querySelector('h1').textContent = translations[lang].title;
        document.querySelector('label[for="aiModel"]').textContent = translations[lang].aiModelLabel;
        document.querySelector('#save').textContent = translations[lang].saveButton;
        document.querySelector('label[for="instructionInput"]').textContent = translations[lang].instructionLabel;
        document.querySelector('#instructionInput').placeholder = translations[lang].instructionPlaceholder;
        document.querySelector('#addInstruction').textContent = translations[lang].addInstruction;
        document.querySelector('#deleteInstruction').textContent = translations[lang].deleteInstruction;
        document.querySelector('label[for="language"]').textContent = translations[lang].languageLabel;

        // API 키 입력 필드 플레이스홀더 업데이트
        const apiInputs = document.querySelectorAll('input[type="text"][id$="ApiKey"]');
        apiInputs.forEach(input => {
            // General placeholder for most API keys, exclude the new one which has specific translations
            if (input.id !== 'google20FlashApiKey' && input.id !== 'ollamaModelName' && input.id !== 'instructionInput') {
                 input.placeholder = translations[lang].apiKeyPlaceholder;
            }
        });

        // Specific translations for Google 2.0 Flash
        const google20FlashLabel = document.querySelector('label[for="google20FlashApiKey"]');
        if (google20FlashLabel) {
            google20FlashLabel.textContent = translations[lang].apiKeyGoogle20Flash || 'Google 2.0 Flash API Key:';
        }
        // The input element itself (google20FlashApiKeyInput) is already globally defined
        if (google20FlashApiKeyInput) {
            google20FlashApiKeyInput.placeholder = translations[lang].apiKeyGoogle20FlashPlaceholder || 'Enter Google 2.0 Flash API Key';
        }

        // Ensure Ollama model name placeholder is also handled if it's different
        if (ollamaModelNameInput) {
            // Assuming it might need a generic or specific placeholder, adjust as necessary
            // For now, let's assume it does not use the generic 'apiKeyPlaceholder'
        }
    });
}

// 페이지 로드 시 언어 적용
applyLanguage();

  function updateUI(data) {
    console.log('Debug: updateUI data object from storage:', JSON.parse(JSON.stringify(data || {})));
    console.log('Debug: updateUI data.google20FlashApiKey:', data ? data.google20FlashApiKey : 'data is null/undefined');
    
    // API 키 값들 설정
    cohereApiKeyInput.value = data.cohereApiKey || '';
    mistralApiKeyInput.value = data.mistralApiKey || '';
    geminiApiKeyInput.value = data.geminiApiKey || '';
    geminiflashApiKeyInput.value = data.geminiflashApiKey || '';
    groqApiKeyInput.value = data.groqApiKey || '';
    ollamaApiKeyInput.value = data.ollamaApiKey || '';
    ollamaModelNameInput.value = data.ollamaModelName || '';
    cerebrasApiKeyInput.value = data.cerebrasApiKey || '';
    
    // 중요: google20FlashApiKey 설정 (이 부분이 누락되어 있었음)
    if (google20FlashApiKeyInput) {
        google20FlashApiKeyInput.value = data.google20FlashApiKey || '';
        console.log('Debug: Setting google20FlashApiKey value to:', data.google20FlashApiKey || '');
    } else {
        console.error('Debug: google20FlashApiKeyInput element not found');
    }
    
    // AI 모델 선택값 설정
    aiModelSelect.value = data.selectedModel || 'cohere';

    // Cerebras 모델 라디오 버튼 설정
    cerebrasModelRadios.forEach(function(radio) {
        radio.checked = data.cerebrasModel === radio.value;
    });

    // UI 표시/숨김 업데이트
    updateApiKeyVisibility(aiModelSelect.value);
  }

  function updateApiKeyVisibility(selectedModel) {
    const cohereSection = document.getElementById('cohereApiSection');
    const mistralSection = document.getElementById('mistralApiSection');
    const geminiSection = document.getElementById('geminiApiSection');
    const geminiflashSection = document.getElementById('geminiflashApiSection');
    const gemini20FlashSection = document.getElementById('gemini20FlashApiSection'); // 이 ID가 올바른지 확인 필요
    const groqSection = document.getElementById('groqApiSection');
    const ollamaSection = document.getElementById('ollamaApiSection');
    const ollamaModelNameSection = document.getElementById('ollamaModelNameSection');
    const cerebrasSection = document.getElementById('cerebrasApiSection');

    // 모든 섹션 숨기기
    if (cohereSection) cohereSection.style.display = 'none';
    if (mistralSection) mistralSection.style.display = 'none';
    if (geminiSection) geminiSection.style.display = 'none';
    if (geminiflashSection) geminiflashSection.style.display = 'none';
    if (gemini20FlashSection) gemini20FlashSection.style.display = 'none';
    if (groqSection) groqSection.style.display = 'none';
    if (ollamaSection) ollamaSection.style.display = 'none';
    if (ollamaModelNameSection) ollamaModelNameSection.style.display = 'none';
    if (cerebrasSection) cerebrasSection.style.display = 'none';

    // 선택된 모델에 따라 해당 섹션 표시
    switch(selectedModel) {
        case 'cohere':
            if (cohereSection) cohereSection.style.display = 'block';
            break;
        case 'mistralSmall':
            if (mistralSection) mistralSection.style.display = 'block';
            break;
        case 'gemini':
            if (geminiSection) geminiSection.style.display = 'block';
            break;
        case 'geminiflash':
            if (geminiflashSection) geminiflashSection.style.display = 'block';
            break;
        case 'gemini20Flash':
            if (gemini20FlashSection) {
                gemini20FlashSection.style.display = 'block';
                console.log('Debug: Showing gemini20Flash section');
            } else {
                console.error('Debug: gemini20FlashSection not found');
            }
            break;
        case 'groq':
            if (groqSection) groqSection.style.display = 'block';
            break;
        case 'ollama':
            if (ollamaSection) ollamaSection.style.display = 'block';
            if (ollamaModelNameSection) ollamaModelNameSection.style.display = 'block';
            break;
        case 'Cerebras':
            if (cerebrasSection) cerebrasSection.style.display = 'block';
            break;
    }
  }

  // 저장된 설정 불러오기 - 모든 필요한 키를 포함해야 함
  chrome.storage.sync.get([
    'cohereApiKey', 
    'mistralApiKey', 
    'geminiApiKey', 
    'geminiflashApiKey', 
    'google20FlashApiKey',  // 이 키가 포함되어 있는지 확인
    'groqApiKey', 
    'ollamaApiKey', 
    'ollamaModelName', 
    'selectedModel', 
    'cerebrasApiKey', 
    'cerebrasModel'
  ], function(data) {
      console.log('Debug: Retrieved data from storage:', data);
      updateUI(data);
  });

  // 저장 버튼 클릭 이벤트
  saveButton.addEventListener('click', function() {
    var cohereApiKey = cohereApiKeyInput.value.trim();
    var mistralApiKey = mistralApiKeyInput.value.trim();
    var geminiApiKey = geminiApiKeyInput.value.trim();
    var geminiflashApiKey = geminiflashApiKeyInput.value.trim();
    var groqApiKey = groqApiKeyInput.value.trim();
    var ollamaApiKey = ollamaApiKeyInput.value.trim();
    var ollamaModelName = ollamaModelNameInput.value.trim();
    var cerebrasApiKey = cerebrasApiKeyInput.value.trim();
    var google20FlashApiKey = google20FlashApiKeyInput ? google20FlashApiKeyInput.value.trim() : '';
    var selectedModel = aiModelSelect.value;
    var cerebrasModel;

    cerebrasModelRadios.forEach(function(radio) {
        if (radio.checked) {
            cerebrasModel = radio.value;
        }
    });

    var dataToSave = {
        cohereApiKey: cohereApiKey,
        mistralApiKey: mistralApiKey,
        geminiApiKey: geminiApiKey,
        geminiflashApiKey: geminiflashApiKey,
        google20FlashApiKey: google20FlashApiKey,  // 이 키가 저장되는지 확인
        groqApiKey: groqApiKey,
        ollamaApiKey: ollamaApiKey,
        ollamaModelName: ollamaModelName,
        selectedModel: selectedModel,
        cerebrasApiKey: cerebrasApiKey,
        cerebrasModel: cerebrasModel
    };

    console.log('Debug: Data to save:', dataToSave);

    chrome.storage.sync.set(dataToSave, function() {
        if (chrome.runtime.lastError) {
            status.textContent = '설정 저장 중 오류가 발생했습니다.';
            console.error('Error saving settings:', chrome.runtime.lastError);
        } else {
            status.textContent = '설정이 저장되었습니다.';
            console.log('Debug: Settings saved successfully');
            setTimeout(function() {
                status.textContent = '';
            }, 3000);
        }
    });
  });

  // AI 모델 선택 변경 이벤트
  aiModelSelect.addEventListener('change', function() {
      console.log('Debug: Model changed to:', this.value);
      updateApiKeyVisibility(this.value);
  });

  // instruction 관련 요소 가져오기
  const instructionInput = document.getElementById('instructionInput');
  const addInstructionButton = document.getElementById('addInstruction');
  const instructionList = document.getElementById('instructionList');
  const deleteInstructionButton = document.getElementById('deleteInstruction');

  // instruction 추가 기능
  addInstructionButton.addEventListener('click', function() {
    const instruction = instructionInput.value.trim();
    if (instruction) {
      const option = document.createElement('option');
      option.value = instruction;
      option.text = instruction;
      instructionList.appendChild(option);
      instructionInput.value = '';

      // instruction 저장
      chrome.storage.sync.get('instructions', function(data) {
        const instructions = data.instructions || [];
        instructions.push(instruction);
        chrome.storage.sync.set({ instructions: instructions });
      });
    }
  });

  // instruction 삭제 기능
  deleteInstructionButton.addEventListener('click', function() {
    const selectedInstruction = instructionList.value;
    if (selectedInstruction) {
      const optionToRemove = instructionList.querySelector(`option[value="${selectedInstruction}"]`);
      if (optionToRemove) {
        instructionList.removeChild(optionToRemove);

        // instruction 저장
        chrome.storage.sync.get('instructions', function(data) {
          const instructions = data.instructions || [];
          const index = instructions.indexOf(selectedInstruction);
          if (index > -1) {
            instructions.splice(index, 1);
            chrome.storage.sync.set({ instructions: instructions });
          }
        });
      }
    }
  });

  // 저장된 instruction 불러오기
  chrome.storage.sync.get('instructions', function(data) {
    const instructions = data.instructions || [];
    instructions.forEach(function(instruction) {
      const option = document.createElement('option');
      option.value = instruction;
      option.text = instruction;
      instructionList.appendChild(option);
    });
  });

});