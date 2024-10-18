document.addEventListener('DOMContentLoaded', function() {
  var cohereApiKeyInput = document.getElementById('cohereApiKey');
  var mistralApiKeyInput = document.getElementById('mistralApiKey');
  var geminiApiKeyInput = document.getElementById('geminiApiKey');
  var geminiflashApiKeyInput = document.getElementById('geminiflashApiKey'); // 추가

  var groqApiKeyInput = document.getElementById('groqApiKey'); // 추가

  var aiModelSelect = document.getElementById('aiModel');
  var saveButton = document.getElementById('save');
  var status = document.getElementById('status');

  function updateUI(data) {
      cohereApiKeyInput.value = data.cohereApiKey || '';
      mistralApiKeyInput.value = data.mistralApiKey || '';
      geminiApiKeyInput.value = data.geminiApiKey || '';
      geminiflashApiKeyInput.value = data.geminiflashApiKey || ''; // 추가

      groqApiKeyInput.value = data.groqApiKey || ''; // 추가
      aiModelSelect.value = data.selectedModel || 'cohere';
      updateApiKeyVisibility(aiModelSelect.value);
      console.log('Loaded settings:', data); // 디버깅을 위한 로그
  }

  function updateApiKeyVisibility(selectedModel) {
    const cohereSection = document.getElementById('cohereApiSection');
    const mistralSection = document.getElementById('mistralApiSection');
    const geminiSection = document.getElementById('geminiApiSection');
    const geminiflashSection = document.getElementById('geminiflashApiSection'); // 추가
    
    const groqSection = document.getElementById('groqApiSection');  // 추가

    cohereSection.style.display = selectedModel === 'cohere' ? 'block' : 'none';
    mistralSection.style.display = selectedModel === 'mistralSmall' ? 'block' : 'none';
    geminiSection.style.display = selectedModel === 'gemini' ? 'block' : 'none';
    geminiflashSection.style.display = selectedModel === 'geminiflash' ? 'block' : 'none'; // 추가

    groqSection.style.display = selectedModel === 'groq'? 'block': 'none';   // 추가

  }

  // 저장된 설정 불러오기
  chrome.storage.sync.get(['cohereApiKey', 'mistralApiKey', 'geminiApiKey', 'geminiflashApiKey', 'groqApiKey', 'selectedModel'], function(data) { // 추가
      updateUI(data);
  });

  // 저장 버튼 클릭 이벤트
  saveButton.addEventListener('click', function() {
    var cohereApiKey = cohereApiKeyInput.value.trim();
    var mistralApiKey = mistralApiKeyInput.value.trim();
    var geminiApiKey = geminiApiKeyInput.value.trim();
    var geminiflashApiKey = geminiflashApiKeyInput.value.trim(); // 추가

    var groqApiKey = groqApiKeyInput.value.trim(); // 추가

    var selectedModel = aiModelSelect.value;

    var dataToSave = {
        cohereApiKey: cohereApiKey,
        mistralApiKey: mistralApiKey,
        geminiApiKey: geminiApiKey,
        geminiflashApiKey: geminiflashApiKey, // 추가

        groqApiKey: groqApiKey, // 추가
        selectedModel: selectedModel
    };

      console.log('Saving settings:', dataToSave); // 저장 전 로그

      chrome.storage.sync.set(dataToSave, function() {
          if (chrome.runtime.lastError) {
              status.textContent = '설정 저장 중 오류가 발생했습니다.';
              console.error('Error saving settings:', chrome.runtime.lastError);
          } else {
              status.textContent = '설정이 저장되었습니다.';
              console.log('Saved settings:', dataToSave); // 저장 후 로그
              setTimeout(function() {
                  status.textContent = '';
              }, 3000);
          }
      });
  });

  // AI 모델 선택 변경 이벤트
  aiModelSelect.addEventListener('change', function() {
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
