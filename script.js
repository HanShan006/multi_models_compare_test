/**
 * 作者：程序员寒山
 * 邮箱：han_shan2000@163.com
 * 
 * 功能简介：
 * 这是一个前端JavaScript实现，主要功能包括：
 * 1. 支持多模型并行测试和比较
 * 2. 实现模型卡片的动态创建和管理
 * 3. 支持Ollama本地模型和DeepSeek API的配置
 * 4. 提供多种预设测试用例
 * 5. 实现流式输出的实时显示
 */

class ModelCard {
    constructor(config) {
        this.config = config;
        this.element = this.createCardElement();
        this.running = false;
    }

    createCardElement() {
        const card = document.createElement('div');
        card.className = 'model-card';
        
        const modelInfo = document.createElement('div');
        modelInfo.className = 'model-info';
        modelInfo.innerHTML = `
            <div class="model-type">${
                this.config.type === 'ollama' ? 'Ollama本地模型' : 
                this.config.type === 'vllm' ? 'VLLM本地模型' : 
                'DeepSeek API'
            }</div>
            <div>模型: ${
                this.config.type === 'ollama' ? this.config.ollamaModel :
                this.config.type === 'vllm' ? this.config.vllmModel :
                this.config.deepseekModel
            }</div>
            <div class="current-test-title" style="color: #666; font-size: 0.9em; margin-top: 5px;"></div>
        `;
        
        const chatArea = document.createElement('div');
        chatArea.className = 'chat-area';
        
        const metrics = document.createElement('div');
        metrics.className = 'metrics';
        metrics.innerHTML = '等待执行...';
        
        card.appendChild(modelInfo);
        card.appendChild(chatArea);
        card.appendChild(metrics);
        
        return card;
    }

    async runTest(input, testTitle = '') {
        if (this.running) return;
        this.running = true;

        // 更新卡片上的测试主题显示
        const testTitleElement = this.element.querySelector('.current-test-title');
        if (testTitleElement && testTitle) {
            testTitleElement.textContent = `当前测试: ${testTitle}`;
        }

        const chatArea = this.element.querySelector('.chat-area');
        const metrics = this.element.querySelector('.metrics');
        
        // 清空之前的内容
        chatArea.innerHTML = '';
        
        // 添加测试主题
        if (testTitle) {
            const titleMsg = document.createElement('div');
            titleMsg.className = 'message title';
            titleMsg.innerHTML = `<strong>测试主题:</strong> ${testTitle}`;
            chatArea.appendChild(titleMsg);
        }
        
        // 添加输入消息
        const inputMsg = document.createElement('div');
        inputMsg.className = 'message input';
        inputMsg.innerHTML = `<strong>输入:</strong> ${input}`;
        chatArea.appendChild(inputMsg);
        
        metrics.innerHTML = '处理中...';
        const startTime = performance.now();

        try {
            // 创建输出消息容器
            const outputMsg = document.createElement('div');
            outputMsg.className = 'message output';
            outputMsg.innerHTML = '<strong>输出:</strong> <span class="stream-content"></span>';
            chatArea.appendChild(outputMsg);
            const streamContent = outputMsg.querySelector('.stream-content');

            // 使用fetch流式处理响应
            const response = await fetch('http://localhost:5001/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input,
                    config: this.config
                })
            });

            const reader = response.body.getReader();
            const textDecoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const text = textDecoder.decode(value);
                try {
                    const data = JSON.parse(text);
                    if (data.text) {
                        accumulatedText += data.text;
                        streamContent.textContent = accumulatedText;
                        chatArea.scrollTop = chatArea.scrollHeight;
                    }
                } catch (e) {
                    console.warn('解析响应数据失败:', e);
                }
            }

            const endTime = performance.now();
            metrics.innerHTML = `执行时间: ${Math.round(endTime - startTime)}ms`;
        } catch (error) {
            console.error('运行错误:', error);
            const errorMsg = document.createElement('div');
            errorMsg.className = 'message error';
            errorMsg.innerHTML = `<strong>错误:</strong> ${error.message}`;
            chatArea.appendChild(errorMsg);
            metrics.innerHTML = '执行失败';
        }
        
        this.running = false;
    }

}

// 主程序逻辑
document.addEventListener('DOMContentLoaded', async () => {
    const cards = [];
    
    // 初始化时获取DeepSeek配置
    try {
        const response = await fetch('http://localhost:5001/api/config/deepseek');
        if (response.ok) {
            const configData = await response.json();
            document.getElementById('deepseekKey').value = configData.api_key;
            document.getElementById('deepseekModel').value = configData.model;
            document.getElementById('deepseekKey').disabled = true;
            document.getElementById('deepseekModel').disabled = true;
        }
    } catch (error) {
        console.error('初始化DeepSeek配置失败:', error);
    }

    const testCases = {
        "知识问答": String.raw`在《三国演义》里，被诸葛亮用空城计吓退的魏国大将是谁？`,
        "逻辑推理": String.raw`有三个人，A说B在说谎，B说C在说谎，C说A和B都在说谎。请问谁在说谎？`,
        "语言理解": String.raw`解释成语"画蛇添足"的字面意思和比喻意义。`,
        "句子生成": String.raw`以"春天"开头，生成5个不同的完整句子。`,
        "代码生成": String.raw`编写一个Python程序，实现快速排序算法，并对列表 [5, 3, 8, 4, 2] 进行排序。`,
        "翻译能力": String.raw`把"不到长城非好汉"翻译成英文。`,
        "数学计算": String.raw`便利店搞促销：买 2 瓶可乐送 1 瓶，每瓶可乐 5 元。小王想给 4 个朋友每人带 1 瓶（包括自己共 5 人），最实惠的买法最少要花多少钱？`,
        "情感分析": String.raw`判断"我本来以为能中大奖，结果连个安慰奖都没有，真是倒霉透顶了！"这句话的情感倾向。`,
        "创意联想": String.raw`如果云朵可以吃，会是什么味道？为什么？`,
        "常识判断": String.raw`骆驼的驼峰储存的是水吗？`
    };
    
    const modal = document.getElementById('modelConfigModal');
    const addButton = document.getElementById('addCard');
    const runButton = document.getElementById('runTests');
    const saveConfigButton = document.getElementById('saveConfig');
    const cancelConfigButton = document.getElementById('cancelConfig');
    const modelTypeSelect = document.getElementById('modelType');
    const ollamaConfig = document.getElementById('ollamaConfig');
    const deepseekConfig = document.getElementById('deepseekConfig');
    const testCasesSelect = document.getElementById('testCases');

    testCasesSelect.addEventListener('change', () => {
        const selectedCase = testCasesSelect.value;
        if (selectedCase && testCases[selectedCase]) {
            document.getElementById('globalInput').value = testCases[selectedCase];
        }
    });

    async function loadOllamaModels() {
        try {
            const response = await fetch('http://localhost:5001/api/ollama/models');
            if (response.ok) {
                const models = await response.json();
                const modelSelect = document.getElementById('ollamaModel');
                modelSelect.innerHTML = models.length ? 
                    models.map(model => `<option value="${model}">${model}</option>`).join('') :
                    '<option value="">未找到已安装的模型</option>';
            } else {
                throw new Error('加载模型列表失败');
            }
        } catch (error) {
            console.error('加载Ollama模型列表错误:', error);
            const modelSelect = document.getElementById('ollamaModel');
            modelSelect.innerHTML = '<option value="">无法连接到Ollama服务</option>';
        }
    }

    addButton.addEventListener('click', () => {
        modal.style.display = 'block';
        if (modelTypeSelect.value === 'ollama') {
            loadOllamaModels();
        }
    });

    // 初始化时获取VLLM配置
    try {
        const response = await fetch('http://localhost:5001/api/config/vllm');
        if (response.ok) {
            const configData = await response.json();
            document.getElementById('vllmModel').value = configData.model;
            document.getElementById('vllmHost').value = configData.host;
            document.getElementById('vllmPort').value = configData.port;
        }
    } catch (error) {
        console.error('初始化VLLM配置失败:', error);
    }

    modelTypeSelect.addEventListener('change', async () => {
        const selectedType = modelTypeSelect.value;
        ollamaConfig.style.display = selectedType === 'ollama' ? 'block' : 'none';
        vllmConfig.style.display = selectedType === 'vllm' ? 'block' : 'none';
        deepseekConfig.style.display = selectedType === 'deepseek' ? 'block' : 'none';
        
        if (selectedType === 'ollama') {
            loadOllamaModels();
        } else {
            // 加载DeepSeek配置
            try {
                const response = await fetch('http://localhost:5001/api/config/deepseek');
                if (!response.ok) throw new Error('获取DeepSeek配置失败');
                const configData = await response.json();
                
                // 显示掩码处理后的key和模型名称
                document.getElementById('deepseekKey').value = configData.api_key;
                document.getElementById('deepseekModel').value = configData.model;
                
                // 禁用输入框
                document.getElementById('deepseekKey').disabled = true;
                document.getElementById('deepseekModel').disabled = true;
            } catch (error) {
                console.error('获取DeepSeek配置失败:', error);
                document.getElementById('deepseekKey').value = '加载配置失败';
                document.getElementById('deepseekModel').value = '加载配置失败';
            }
        }
    });

    saveConfigButton.addEventListener('click', async () => {
        const type = modelTypeSelect.value;
        const config = {
            type,
            ollamaModel: document.getElementById('ollamaModel').value
        };

        if (type === 'ollama') {
            if (!config.ollamaModel) {
                alert('请选择Ollama模型');
                return;
            }
        } else if (type === 'vllm') {
            config.vllmModel = document.getElementById('vllmModel').value;
            config.vllmHost = document.getElementById('vllmHost').value;
            config.vllmPort = document.getElementById('vllmPort').value;
            if (!config.vllmHost || !config.vllmPort) {
                alert('请填写VLLM服务配置');
                return;
            }
        } else {
            try {
                const response = await fetch('http://localhost:5001/api/config/deepseek');
                if (!response.ok) throw new Error('获取DeepSeek配置失败');
                const configData = await response.json();
                
                config.deepseekKey = configData.real_key;
                config.deepseekModel = configData.model;
                
                // 显示掩码后的key和模型名称
                document.getElementById('deepseekKey').value = configData.api_key;
                document.getElementById('deepseekModel').value = configData.model;
            } catch (error) {
                alert('获取DeepSeek配置失败: ' + error.message);
                return;
            }
        }

        const card = new ModelCard(config);
        cards.push(card);
        
        // 添加到卡片容器
        const cardsContainer = document.getElementById('cardsContainer');
        
        // 如果没有行，创建一行
        let row = document.querySelector('.model-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'model-row';
            cardsContainer.appendChild(row);
        }
        
        // 添加卡片到行
        row.appendChild(card.element);
        
        modal.style.display = 'none';

        // 仅清空Ollama相关表单
        if (type === 'ollama') {
            document.getElementById('ollamaModel').value = '';
        }
    });

    cancelConfigButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    runButton.addEventListener('click', async () => {
        if (cards.length === 0) {
            alert('请先添加测试模型');
            return;
        }

        const input = document.getElementById('globalInput').value.trim();
        if (!input) {
            alert('请输入测试文本');
            return;
        }

        // 获取测试主题
        const testCaseSelect = document.getElementById('testCases');
        const testTitle = testCaseSelect.options[testCaseSelect.selectedIndex].text;

        // 检查是否已有测试历史记录
        const hasTestHistory = document.querySelectorAll('.model-row .message.title').length > 0;

        if (!hasTestHistory) {
            // 第一次测试 - 直接使用现有卡片
            for (const card of cards) {
                await card.runTest(input, testTitle);
            }
        } else {
            // 后续测试 - 创建新行并复制卡片
            const newRow = document.createElement('div');
            newRow.className = 'model-row';
            document.getElementById('cardsContainer').appendChild(newRow);
            
            const newCards = [];
            for (const card of cards) {
                const newCard = new ModelCard(card.config);
                newCards.push(newCard);
                newRow.appendChild(newCard.element);
            }

            // 测试新行中的卡片
            for (const card of newCards) {
                await card.runTest(input, testTitle);
            }
        }
    });
});
