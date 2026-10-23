// ==UserScript==
// @name         考试系统 <-> AI (V2.3 完美整合版)
// @namespace    http://tampermonkey.net/
// @version      V2.3
// @description  完美UI，全自动追踪所有题目，适配最新页面结构，修复DS串线问题，增加使用指南。
// @match        http://192.168.2.51:8000/qt/*
// @match        https://chat.deepseek.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// ==/UserScript==

(function() {
    'use strict';

    const hostname = window.location.hostname;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // ==========================================
    // 一、考试系统端逻辑
    // ==========================================
    if (hostname === '192.168.2.51') {
        let isAutoRunning = false;
        let isProcessing = false;
        let questionBank = [];

        try { questionBank = JSON.parse(GM_getValue('exam_question_bank', '[]')); } catch (e) { questionBank = []; }

        // 实时保存题库（防抖，避免频繁写盘卡顿）
        let saveTimeout = null;
        const saveBank = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                try { GM_setValue('exam_question_bank', JSON.stringify(questionBank)); } catch(e){}
            }, 1000);
        };

        const waitForCondition = (conditionFn, timeout = 1500, interval = 50) => {
            return new Promise((resolve) => {
                let start = Date.now();
                const timer = setInterval(() => {
                    if (conditionFn()) {
                        clearInterval(timer);
                        resolve(true);
                    } else if (Date.now() - start > timeout) {
                        clearInterval(timer);
                        resolve(false);
                    }
                }, interval);
            });
        };

        const getCorrectLetters = () => {
            const el = document.querySelector('.zhengque-daan');
            if (el) {
                const l = el.innerText.match(/[A-D]/g);
                if (l) return [...new Set(l)];
            }
            const match = document.body.innerText.match(/正确答案[：:]\s*([A-D、，,\s]+)/);
            if (match) {
                const l = match[1].match(/[A-D]/g);
                if (l) return [...new Set(l)];
            }
            return [];
        };

        // 提取当前题目和选项（已适配 Element UI 结构）
        const extractCurrentQuestion = () => {
            const titleEl = document.querySelector('.exam_timu');
            if (!titleEl) return null;

            const questionSignature = titleEl.innerText.trim();
            if (!questionSignature) return null;

            let qType = "单选题";
            const typeEl = document.querySelector('.timu_type');
            if (typeEl) qType = typeEl.innerText.trim();

            const isMultiple = qType.includes('多') || document.querySelectorAll('.el-checkbox.is-checked').length > 1;

            const options = [];
            document.querySelectorAll('.exam_daan').forEach(optDiv => {
                const letterSpan = optDiv.querySelector('.xuanxiang');
                const textDiv = optDiv.querySelector('.wenbenkuang');
                if (letterSpan && textDiv) {
                    const letter = letterSpan.innerText.replace('.', '').trim();
                    const text = textDiv.innerText.trim();
                    options.push(`${letter}. ${text}`);
                }
            });

            return { questionSignature, qType, isMultiple, options };
        };

        // ==========================================
        // 全自动后台监听器（全收录 + 补全答案）
        // ==========================================
        setInterval(() => {
            const q = extractCurrentQuestion();
            if (!q) return;

            const { questionSignature, qType, options } = q;
            let record = questionBank.find(item => item.question === questionSignature);

            if (!record && options.length > 0) {
                record = {
                    question: questionSignature,
                    qType: qType,
                    options: options,
                    source: "手动/浏览",
                    correctAnswer: ""
                };
                questionBank.push(record);
                saveBank();
                console.log("📥 收录新题: ", questionSignature);
            }

            if (record && (!record.correctAnswer || record.correctAnswer === "")) {
                const correctLetters = getCorrectLetters();
                if (correctLetters.length > 0) {
                    record.correctAnswer = correctLetters.join(',');
                    saveBank();
                    console.log("✅ 补全答案: ", record.correctAnswer);
                }
            }
        }, 800);

        // ==========================================
        // UI 注入
        // ==========================================
        const injectUI = setInterval(() => {
            if (document.body && !document.getElementById('ai-btn')) {
                const baseStyle = `position: fixed; top: 20px; z-index: 999999; padding: 10px 16px; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.2s;`;

                const btn = document.createElement('button');
                btn.id = 'ai-btn';
                btn.innerText = '🤖 单题 AI';
                btn.style.cssText = `${baseStyle} right: 160px; background: #409EFF;`;

                const autoBtn = document.createElement('button');
                autoBtn.id = 'ai-auto-btn';
                autoBtn.innerText = '🚀 全自动';
                autoBtn.style.cssText = `${baseStyle} right: 20px; background: #67C23A;`;

                const askBtn = document.createElement('button');
                askBtn.id = 'ask-btn';
                askBtn.innerText = '❓ 仅问 AI';
                askBtn.style.cssText = `${baseStyle} right: 280px; background: #909399;`;

                const exportBtn = document.createElement('button');
                exportBtn.id = 'export-btn';
                exportBtn.innerText = '📥 导出题库';
                exportBtn.style.cssText = `${baseStyle} right: 400px; background: #E6A23C;`;

                const aboutBtn = document.createElement('button');
                aboutBtn.id = 'about-btn';
                aboutBtn.innerText = 'ℹ️ 关于此物';
                aboutBtn.style.cssText = `${baseStyle} right: 520px; background: #606266;`;

                document.body.appendChild(btn);
                document.body.appendChild(autoBtn);
                document.body.appendChild(askBtn);
                document.body.appendChild(exportBtn);
                document.body.appendChild(aboutBtn);

                // 导出逻辑
                exportBtn.onclick = () => {
                    try { GM_setValue('exam_question_bank', JSON.stringify(questionBank)); } catch(e){}
                    if (questionBank.length === 0) { alert("题库还是空的！"); return; }

                    const uniqueBank = Array.from(new Map(questionBank.map(item => [item.question, item])).values());
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(uniqueBank, null, 2));
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.setAttribute("href", dataStr);
                    downloadAnchorNode.setAttribute("download", "ai_question_bank.json");
                    document.body.appendChild(downloadAnchorNode);
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                };

                // 关于弹窗逻辑
                aboutBtn.onclick = () => {
                    const modalHtml = `
                        <div id="about-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 9999999; display: flex; justify-content: center; align-items: center;">
                            <div style="background: white; border-radius: 8px; width: 540px; max-width: 90vw; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; flex-direction: column; overflow: hidden; color: #333; font-family: sans-serif;">
                                <div style="padding: 15px 20px; border-bottom: 1px solid #ebeef5; display: flex; justify-content: space-between; align-items: center; background: #fcfcfc;">
                                    <h3 style="margin: 0; font-size: 18px; font-weight: bold;">关于此物 (V2.3 稳定版)</h3>
                                    <button id="close-about-btn" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #909399; line-height: 1;">&times;</button>
                                </div>
                                <div style="padding: 20px; font-size: 14px; line-height: 1.6; overflow-y: auto; max-height: 65vh;">
                                    <p style="margin-top: 0;"><strong>📌 按钮功能说明：</strong></p>
                                    <ul style="padding-left: 20px; margin-top: 5px; margin-bottom: 15px;">
                                        <li><strong>🤖 单题 AI：</strong> 调用 DeepSeek 获取答案，并<strong>自动</strong>帮你勾选、提交。</li>
                                        <li><strong>❓ 仅问 AI：</strong> 仅调用 DeepSeek 查答案，会弹窗告诉你，但<strong>不会</strong>替你点选项。</li>
                                        <li><strong>🚀 全自动：</strong> 纯本地暴力破解，<strong>不调用 DeepSeek</strong>。系统先随机盲猜，如果错了，会读取页面暴露的“正确答案”自动纠正填选，然后跳下一题。</li>
                                        <li><strong>📥 导出题库：</strong> 将后台自动收录的题库（题目+选项+正确答案）导出为 JSON 文件。</li>
                                    </ul>

                                    <p style="color: #E6A23C; margin-bottom: 5px;"><strong>⚠️ 风险警告 (DS 风控)：</strong></p>
                                    <ul style="padding-left: 20px; margin-top: 5px; margin-bottom: 15px;">
                                        <li><strong>频繁请求限制：</strong> 短时间高频使用“单题 AI”或“仅问 AI”，会触发官方风控（AI 不回复、乱码、甚至临时封禁）。</li>
                                        <li><strong>安全建议：</strong> 若被风控，请切到 <strong>“全自动”</strong> 模式刷题，它完全不受 DS 限制。</li>
                                    </ul>

                                    <p style="color: #F56C6C; margin-bottom: 5px;"><strong>💡 提示：</strong></p>
                                    <ul style="padding-left: 20px; margin-top: 5px;">
                                        <li>若 AI 超时或解析错，可多尝试点击几次。</li>
                                        <li>数据存在浏览器本地，<strong>请务必定期导出题库备份</strong>，避免清缓存丢失。</li>
                                    </ul>
                                </div>
                                <div style="padding: 15px 20px; border-top: 1px solid #ebeef5; text-align: right; background: #fafafa;">
                                    <button id="confirm-about-btn" style="padding: 8px 16px; background: #409EFF; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">我知道了</button>
                                </div>
                            </div>
                        </div>
                    `;
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                    const modal = document.getElementById('about-modal');
                    const closeModal = () => { modal.remove(); };
                    document.getElementById('close-about-btn').onclick = closeModal;
                    document.getElementById('confirm-about-btn').onclick = closeModal;
                    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
                };

                // 点击选项逻辑（适配 Element UI）
                const setOptionState = async (targetLetter, shouldBeChecked) => {
                    const currentOpts = Array.from(document.querySelectorAll('.exam_daan'));
                    const opt = currentOpts.find(div => {
                        const letterSpan = div.querySelector('.xuanxiang');
                        return letterSpan && letterSpan.innerText.replace('.', '').trim() === targetLetter;
                    });

                    if (!opt) return;
                    const label = opt.querySelector('label');
                    if (!label) return;

                    const isCurrentlyChecked = label.classList.contains('is-checked');

                    if (shouldBeChecked && !isCurrentlyChecked) {
                        label.click();
                        await waitForCondition(() => label.classList.contains('is-checked'), 300, 50);
                    } else if (!shouldBeChecked && isCurrentlyChecked) {
                        label.click();
                        await waitForCondition(() => !label.classList.contains('is-checked'), 300, 50);
                    }
                };

                const doQuestion = async (mode = 'RANDOM') => {
                    if (isProcessing) return false;
                    isProcessing = true;

                    try {
                        await waitForCondition(() => document.querySelector('.exam_timu') !== null, 2000, 50);
                        const q = extractCurrentQuestion();
                        if (!q || q.options.length === 0) { isProcessing = false; return false; }

                        const { questionSignature, qType, isMultiple, options } = q;
                        let initialLetters = [];

                        if (mode === 'DS' || mode === 'ASK') {
                            const prompt = `请直接回答以下选择题。只输出正确选项的大写字母（多选如 A,B）。绝不要解释！\n类型：${qType}\n题目：${questionSignature}\n选项：\n${options.join('\n')}`;

                            // 防串线核心：生成唯一请求ID
                            const reqId = Date.now().toString();
                            GM_setValue('ds_current_req_id', reqId);
                            GM_setValue('ds_current_prompt', prompt);
                            GM_deleteValue('ds_current_answer');

                            if (mode === 'DS') btn.innerText = '⏳ 思考中...';
                            else askBtn.innerText = '⏳ 思考中...';

                            let answer = null;
                            for (let i = 0; i < 300; i++) {
                                // 必须匹配当前请求ID
                                const respId = GM_getValue('ds_current_resp_id');
                                if (respId === reqId) {
                                    answer = GM_getValue('ds_current_answer');
                                    if (answer) break;
                                }
                                await sleep(150);
                            }

                            if (!answer || answer === 'X') {
                                isProcessing = false;
                                if (mode === 'ASK') alert("AI 获取超时或失败！");
                                if (mode === 'DS') btn.innerText = '🤖 单题 AI';
                                else askBtn.innerText = '❓ 仅问 AI';
                                return false;
                            }
                            GM_deleteValue('ds_current_answer');
                            initialLetters = [...new Set((answer.toUpperCase().match(/[A-D]/g) || []))];
                        } else {
                            const letters = options.map(o => o.split('.')[0]);
                            if (isMultiple) {
                                initialLetters = letters.filter(() => Math.random() < 0.4);
                                if (!initialLetters.length) initialLetters = [letters[Math.floor(Math.random() * letters.length)]];
                            } else {
                                initialLetters = [letters[Math.floor(Math.random() * letters.length)]];
                            }
                        }

                        if (mode === 'ASK') {
                            const displayStr = options.filter(o => initialLetters.includes(o.split('.')[0])).join('\n');
                            alert(`AI 认为答案是：${initialLetters.join(',')}\n\n${displayStr}`);
                            isProcessing = false;
                            return { success: true, signature: questionSignature, skip: true };
                        }

                        // 填选选项
                        for (let opt of options) {
                            const letter = opt.split('.')[0];
                            await setOptionState(letter, initialLetters.includes(letter));
                        }
                        await sleep(300); // 给Vue渲染时间

                        // 点击确认
                        const confirmBtn = document.querySelector('.btn-confirm button');
                        if (confirmBtn && !confirmBtn.disabled) {
                            confirmBtn.click();
                        }

                        let isCorrect = false;
                        await waitForCondition(() => {
                            const newTitle = document.querySelector('.exam_timu')?.innerText.trim() || "";
                            if (newTitle && newTitle !== questionSignature) { isCorrect = true; return true; }
                            if (document.body.innerText.includes("正确答案")) return true;
                            return false;
                        }, 1500, 50);

                        let finalAnswerStr = initialLetters.join(',');

                        // 答错修正
                        if (!isCorrect) {
                            await waitForCondition(() => getCorrectLetters().length > 0, 1500, 50);
                            const uniqueCorrect = getCorrectLetters();
                            if (uniqueCorrect.length > 0) {
                                finalAnswerStr = uniqueCorrect.join(',');
                                const allLetters = options.map(o => o.split('.')[0]);
                                for (let letter of allLetters) {
                                    await setOptionState(letter, uniqueCorrect.includes(letter));
                                }
                                await sleep(300);
                                if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();

                                await waitForCondition(() => {
                                    const c = document.querySelector('.exam_timu')?.innerText.trim() || "";
                                    return c !== questionSignature && c !== "";
                                }, 2500, 50);
                            }
                        }

                        // 更新题库
                        let record = questionBank.find(item => item.question === questionSignature);
                        if (record) {
                            record.source = mode;
                            record.initialAnswer = initialLetters.join(',');
                            record.wasCorrect = isCorrect;
                            if (finalAnswerStr && finalAnswerStr !== "") {
                                record.correctAnswer = finalAnswerStr;
                            }
                            saveBank();
                        }

                        isProcessing = false;
                        return { success: true, signature: questionSignature, isMultiple: isMultiple };

                    } catch (e) {
                        console.error("答题出错", e);
                        isProcessing = false;
                        return false;
                    }
                };

                btn.onclick = async () => {
                    if (isAutoRunning) return;
                    GM_openInTab('https://chat.deepseek.com/', { active: false, insert: true, setParent: true });
                    await doQuestion('DS');
                    btn.innerText = '🤖 单题 AI';
                };

                askBtn.onclick = async () => {
                    if (isAutoRunning) { alert("请先停止全自动模式！"); return; }
                    GM_openInTab('https://chat.deepseek.com/', { active: false, insert: true, setParent: true });
                    await doQuestion('ASK');
                    askBtn.innerText = '❓ 仅问 AI';
                };

                autoBtn.onclick = async () => {
                    if (isAutoRunning) {
                        isAutoRunning = false;
                        autoBtn.innerText = '🚀 全自动';
                        autoBtn.style.background = '#67C23A';
                        btn.innerText = '🤖 单题 AI';
                    } else {
                        isAutoRunning = true;
                        autoBtn.innerText = '🛑 停止';
                        autoBtn.style.background = '#F56C6C';

                        while (isAutoRunning) {
                            const result = await doQuestion('RANDOM');
                            if (!result || !isAutoRunning) break;

                            const currentTitle = document.querySelector('.exam_timu')?.innerText.trim() || "";
                            if (currentTitle === result.signature) {
                                let changed = await waitForCondition(() => {
                                    const checkTitle = document.querySelector('.exam_timu')?.innerText.trim() || "";
                                    return checkTitle !== "" && checkTitle !== result.signature;
                                }, 800, 50);

                                if (!changed) {
                                    const nextBtn = Array.from(document.querySelectorAll('button.el-button')).find(el => el.innerText.includes('下一题') && !el.disabled);
                                    if (nextBtn) {
                                        nextBtn.click();
                                        await waitForCondition(() => {
                                            const c = document.querySelector('.exam_timu')?.innerText.trim() || "";
                                            return c !== result.signature && c !== "";
                                        }, 2000, 50);
                                    } else {
                                        alert("题库已刷完或找不到下一题！");
                                        break;
                                    }
                                }
                            }
                            await sleep(500); // 防止刷得太快
                            autoBtn.innerText = '⏳ 答题中...';
                        }

                        isAutoRunning = false;
                        isProcessing = false;
                        autoBtn.innerText = '🚀 全自动';
                        autoBtn.style.background = '#67C23A';
                        btn.innerText = '🤖 单题 AI';
                    }
                };
            }
        }, 500);
    }

    // ==========================================
    // 二、DeepSeek 页面端逻辑
    // ==========================================
    if (hostname === 'chat.deepseek.com') {
        let isProcessing = false;

        const waitForCondition = (conditionFn, timeout = 1500, interval = 50) => {
            return new Promise((resolve) => {
                let start = Date.now();
                const timer = setInterval(() => {
                    if (conditionFn()) {
                        clearInterval(timer);
                        resolve(true);
                    } else if (Date.now() - start > timeout) {
                        clearInterval(timer);
                        resolve(false);
                    }
                }, interval);
            });
        };

        setInterval(async () => {
            const prompt = GM_getValue('ds_current_prompt');
            if (!prompt || isProcessing) return;

            // 获取这次的请求ID
            const reqId = GM_getValue('ds_current_req_id');

            isProcessing = true;
            GM_deleteValue('ds_current_prompt');

            const newChatBtn = Array.from(document.querySelectorAll('div, button, a')).find(el => el.innerText.includes('开启新对话'));
            if (newChatBtn) {
                newChatBtn.click();
                await waitForCondition(() => document.querySelectorAll('.ds-markdown-paragraph').length === 0, 2000, 100);
                await sleep(500);
            }

            const textareas = Array.from(document.querySelectorAll('textarea'));
            const textarea = textareas.find(el => el.placeholder && el.placeholder.includes('发送消息'));

            if (!textarea) {
                isProcessing = false; // 找不到输入框直接退出，防止卡死
                return;
            }

            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeSetter.call(textarea, prompt);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();

            await sleep(500);

            const buttons = Array.from(document.querySelectorAll('div[role="button"].ds-button--primary'));
            const sendBtn = buttons.find(b => !b.className.includes('disabled'));

            if (sendBtn) {
                sendBtn.click();
                waitForAnswer(reqId).then(() => { isProcessing = false; });
            } else {
                console.log("未找到发送按钮，放弃本次");
                isProcessing = false;
            }
        }, 1000);

        // 接收 reqId
        function waitForAnswer(reqId) {
            return new Promise((resolve) => {
                let startTime = Date.now();
                const timer = setInterval(() => {
                    if (Date.now() - startTime > 120000) {
                        clearInterval(timer);
                        GM_setValue('ds_current_answer', 'X');
                        GM_setValue('ds_current_resp_id', reqId); // 超时也带ID
                        resolve();
                        return;
                    }

                    const isGenerating = document.querySelector('[aria-label="停止生成"]') || document.querySelector('.ds-icon--stop');
                    if (isGenerating) return;

                    const paragraphs = document.querySelectorAll('.ds-markdown-paragraph');
                    if (paragraphs.length > 0) {
                        const lastParagraph = paragraphs[paragraphs.length - 1];
                        const text = lastParagraph.innerText.trim();

                        if (text.length > 0 && text.length <= 30) {
                            const matches = text.match(/[A-D]/g);
                            if (matches && matches.length > 0) {
                                clearInterval(timer);
                                GM_setValue('ds_current_answer', [...new Set(matches)].join(','));
                                // 回传答案时带上 reqId，完成闭环
                                GM_setValue('ds_current_resp_id', reqId);
                                resolve();
                            }
                        }
                    }
                }, 300);
            });
        }
    }
})();