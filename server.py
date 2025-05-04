from flask import Flask, request, jsonify, Response, send_from_directory
import os
import psutil
import requests
import json
import time
import configparser
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 读取配置文件
config = configparser.ConfigParser()
config.read('config.ini')

@app.route('/api/config/deepseek', methods=['GET'])
def get_deepseek_config():
    try:
        api_key = config.get('deepseek', 'api_key')
        model = config.get('deepseek', 'model')
        # 对API key进行掩码处理
        masked_key = api_key[:4] + '*' * (len(api_key) - 8) + api_key[-4:]
        return jsonify({
            'api_key': masked_key,
            'real_key': api_key,
            'model': model
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_system_metrics():
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    
    try:
        import torch
        gpu_memory = torch.cuda.memory_allocated() / 1024**2 if torch.cuda.is_available() else None
    except:
        gpu_memory = None
        
    return {
        'memory': f"{memory_info.rss / 1024**2:.1f}MB",
        'gpu_memory': f"{gpu_memory:.1f}MB" if gpu_memory is not None else None
    }

@app.route('/api/ollama/models', methods=['GET'])
def get_ollama_models():
    try:
        response = requests.get('http://localhost:11434/api/tags')
        if response.status_code == 200:
            models = [tag['model'] for tag in response.json()['models']]
            return jsonify(models)
        else:
            raise Exception('获取Ollama模型列表失败')
    except requests.exceptions.RequestException:
        return jsonify({'error': '无法连接到Ollama服务'}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    input_text = data['input']
    config = data['config']
    print(f"接收到请求，输入文本: {input_text}，配置: {config}")
    
    try:
        if config['type'] == 'ollama':
            return call_ollama(input_text, config['ollamaModel'])
        else:
            # 使用配置文件中的API key，而不是前端传来的key
            api_key = config.get('deepseek', 'api_key')
            return call_deepseek(input_text, config['deepseekKey'], config['deepseekModel'])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def call_ollama(input_text, model_name):
    def generate_response():
        try:
            response = requests.post('http://localhost:11434/api/generate', 
                                   json={
                                       'model': model_name,
                                       'prompt': input_text,
                                       'stream': True,
                                       "options": { "temperature": 0.7,
                                        "max_tokens": 1000
                                       }    
                                   },
                                   stream=True)
            
            if response.status_code != 200:
                error_msg = f'Ollama API调用失败: HTTP {response.status_code}'
                try:
                    error_data = response.json()
                    if 'error' in error_data:
                        error_msg += f" - {error_data['error']}"
                except:
                    pass
                print(f"Ollama错误: {error_msg}")
                yield json.dumps({'error': error_msg})
                return

            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if 'response' in data:
                            yield json.dumps({'text': data['response']})
                    except json.JSONDecodeError as e:
                        print(f"JSON解析错误: {e}")
                        continue

        except requests.exceptions.RequestException as e:
            error_msg = f'无法连接到Ollama服务: {str(e)}'
            print(f"Ollama连接错误: {error_msg}")
            yield json.dumps({'error': error_msg})

    return Response(generate_response(), mimetype='application/json')

def call_deepseek(input_text, api_key, model_name):
    def generate_response():
        try:
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }
            print(f"DeepSeek API key: {api_key}")
            # 先验证API key格式
            if not api_key.startswith('sk-'):
                yield json.dumps({'error': 'DeepSeek API key 格式无效，应以 sk- 开头'})
                return

            print(f"正在调用DeepSeek API，使用模型: {model_name}，Key: {api_key}")
            response = requests.post(
                'https://api.deepseek.com/v1/chat/completions',
                headers=headers,
                json={
                                       'model': model_name,
                                       'messages': [{'role': 'user', 'content': input_text}],
                                       'stream': False,
                                       'temperature': 0.7,
                                       'max_tokens': 2000
                }
            )
            
            if response.status_code == 401:
                error_msg = 'DeepSeek API key 无效。请在 config.ini 文件中配置正确的 API key，可以从 https://platform.deepseek.com/ 获取'
                print(f"认证错误: {error_msg}")
                yield json.dumps({'error': error_msg})
                return
            elif response.status_code != 200:
                error_msg = f'DeepSeek API调用失败: HTTP {response.status_code}'
                try:
                    error_data = response.json()
                    if 'message' in error_data:
                        error_msg += f" - {error_data['message']}"
                except:
                    pass
                print(f"DeepSeek错误: {error_msg}")
                yield json.dumps({'error': error_msg})
                return

            data = response.json()
            if 'choices' in data and len(data['choices']) > 0:
                content = data['choices'][0]['message']['content']
                print(f"DeepSeek响应内容长度: {len(content)}字符")
                # 为了模拟流式输出，我们将内容分段发送
                for char in content:
                    yield json.dumps({'text': char})
                    time.sleep(0.01)  # 添加小的延迟以实现流式效果
            else:
                error_msg = 'DeepSeek返回数据格式无效'
                print(f"数据错误: {error_msg}")
                yield json.dumps({'error': error_msg})

        except requests.exceptions.RequestException as e:
            error_msg = f'无法连接到DeepSeek API: {str(e)}'
            print(f"DeepSeek连接错误: {error_msg}")
            yield json.dumps({'error': error_msg})

    return Response(generate_response(), mimetype='application/json')

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
