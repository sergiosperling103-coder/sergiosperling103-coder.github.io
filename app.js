/* global TomlMerge, DEEPSEEK_MODELS_CATALOG */
(function () {
  "use strict";

  var STATE = {
    step: 1,
    maxStep: 1,
    key: "",
    model: "deepseek-v4-flash",
    dirHandle: null,
    pendingExisting: null,
    deployed: false,
    validated: false
  };

  var STEP_META = {
    1: { title: "下载并安装 Codex", subtitle: "从一个官方下载按钮开始，全程无需命令行。" },
    2: { title: "登录 DeepSeek 开放平台", subtitle: "密码与验证码由你自己输入，工具只负责打开页面。" },
    3: { title: "创建并粘贴 API Key", subtitle: "粘贴后可在网页直接验证，Key 不会上传到任何服务器。" },
    4: { title: "一键部署到 Codex", subtitle: "三种方式任选：网页直写、官方脚本、手动下载。" },
    5: { title: "全部完成，开始使用", subtitle: "重启 Codex，DeepSeek 模型即刻可用。" }
  };

  var $ = function (id) { return document.getElementById(id); };

  var URLS = {
    codex: "https://openai.com/codex/",
    chatgptDownload: "https://chatgpt.com/download/",
    cli: "https://github.com/openai/codex",
    deepseek: "https://platform.deepseek.com/",
    apiKeys: "https://platform.deepseek.com/api_keys"
  };

  // ---------- Toast ----------

  function toast(msg, kind) {
    var root = $("toastRoot");
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 260);
    }, 3200);
  }

  // ---------- 步骤切换 ----------

  function setStep(n) {
    STATE.step = n;
    STATE.maxStep = Math.max(STATE.maxStep, n);

    var panels = document.querySelectorAll(".step-panel");
    for (var i = 0; i < panels.length; i++) {
      panels[i].hidden = panels[i].getAttribute("data-step") !== String(n);
    }

    var steps = document.querySelectorAll(".side-step");
    for (var j = 0; j < steps.length; j++) {
      var s = Number(steps[j].getAttribute("data-step"));
      steps[j].classList.toggle("active", s === n);
      steps[j].classList.toggle("done", s < n);
    }

    var meta = STEP_META[n] || STEP_META[1];
    $("stepTitle").textContent = meta.title;
    $("stepSubtitle").textContent = meta.subtitle;

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToStep(n) {
    if (n > STATE.maxStep) {
      toast("请先完成前面的步骤", "warn");
      return;
    }
    setStep(n);
  }

  // ---------- 状态提示 ----------

  function showStatus(el, kind, text) {
    el.className = "status show " + kind;
    el.textContent = text;
  }

  function hideStatus(el) {
    el.className = "status";
    el.textContent = "";
  }

  // ---------- 步骤 1 ----------

  function openUrl(url) {
    window.open(url, "_blank", "noopener");
  }

  // ---------- 步骤 3：Key 验证 ----------

  function currentModel() {
    return $("modelSelect").value;
  }

  function validateKey() {
    var key = $("apiKeyInput").value.trim();
    var status = $("validateStatus");
    var model = currentModel();
    hideStatus(status);

    if (!/^sk-/.test(key)) {
      showStatus(status, "err", "Key 看起来不对，应以 sk- 开头，请检查后重试。");
      toast("Key 应以 sk- 开头", "err");
      return Promise.resolve(false);
    }

    var btn = $("btnValidateKey");
    btn.classList.add("loading");
    btn.disabled = true;
    showStatus(status, "info", "正在向 DeepSeek API 发起一个最小请求（仅验证 Key 与模型可用性）…");

    return fetch("https://api.deepseek.com/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        input: "ping",
        max_output_tokens: 8,
        stream: false
      })
    }).then(function (res) {
      if (res.ok) {
        STATE.key = key;
        STATE.model = model;
        STATE.validated = true;
        showStatus(status, "ok", "验证通过！Key 有效，" + model + " 可用。");
        toast("Key 验证通过", "ok");
        return true;
      }
      return res.json().then(function (data) {
        var msg = (data && (data.error && data.error.message || data.message)) || res.statusText;
        showStatus(status, "err", "验证失败（HTTP " + res.status + "）：" + msg);
        toast("验证失败：HTTP " + res.status, "err");
        return false;
      }).catch(function () {
        showStatus(status, "err", "验证失败（HTTP " + res.status + "），请稍后重试。");
        toast("验证失败：HTTP " + res.status, "err");
        return false;
      });
    }).catch(function (err) {
      showStatus(status, "err", "网络请求失败：" + err.message + "。可跳过验证，部署后在 Codex 里实测。");
      toast("网络请求失败", "err");
      return false;
    }).finally(function () {
      btn.classList.remove("loading");
      btn.disabled = false;
    });
  }

  function rememberKeyWithoutValidation() {
    var key = $("apiKeyInput").value.trim();
    if (!/^sk-/.test(key)) {
      showStatus($("validateStatus"), "err", "请先粘贴以 sk- 开头的 Key，或点击“验证 Key”。");
      toast("请先粘贴有效的 Key", "warn");
      return false;
    }
    STATE.key = key;
    STATE.model = currentModel();
    return true;
  }

  // ---------- 步骤 4：一键部署 ----------

  function readFile(dirHandle, name) {
    return dirHandle.getFileHandle(name).then(function (fh) {
      return fh.getFile().then(function (f) { return f.text(); });
    }).catch(function () {
      return null;
    });
  }

  function writeFile(dirHandle, name, text) {
    return dirHandle.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
    });
  }

  function deleteFile(dirHandle, name) {
    return dirHandle.getFileHandle(name).then(function (fh) {
      return fh.remove();
    }).catch(function () { /* 文件不存在也没关系 */ });
  }

  function catalogText() {
    return JSON.stringify(window.DEEPSEEK_MODELS_CATALOG, null, 2) + "\n";
  }

  function deployStatus() {
    return $("deployStatus");
  }

  function pickAndDeploy() {
    var status = deployStatus();
    hideStatus(status);

    if (!window.showDirectoryPicker) {
      showStatus(status, "err", "当前浏览器不支持网页直接写文件（需要 Chrome 或 Edge）。请改用方式 B 官方脚本，或方式 C 下载配置。");
      toast("当前浏览器不支持方式 A", "err");
      return;
    }
    if (!STATE.key) {
      showStatus(status, "err", "请先回到步骤 3 粘贴并验证 API Key。");
      toast("请先完成步骤 3", "warn");
      setStep(3);
      return;
    }

    window.showDirectoryPicker({ mode: "readwrite" }).then(function (dirHandle) {
      STATE.dirHandle = dirHandle;
      $("deployConfirm").hidden = false;
      $("catalogPathInput").value = "~/.codex/models.json";
      showStatus(status, "info", "已选择文件夹：“" + dirHandle.name + "”。请确认上方路径（Windows 建议改为完整路径），然后点击“确认写入配置”。");
      return readFile(dirHandle, "config.toml").then(function (existing) {
        STATE.pendingExisting = existing;
      });
    }).catch(function (err) {
      if (err && err.name === "AbortError") {
        hideStatus(status);
      } else {
        showStatus(status, "err", "选择/读取失败：" + err.message);
        toast("读取文件夹失败", "err");
      }
    });
  }

  function confirmDeploy() {
    var status = deployStatus();
    if (!STATE.dirHandle) {
      showStatus(status, "err", "请先点击“选择 ~/.codex 文件夹并部署”。");
      return;
    }
    var btn = $("btnConfirmDeploy");
    btn.classList.add("loading");
    btn.disabled = true;
    showStatus(status, "info", "正在备份并写入配置…");
    deploy(STATE.dirHandle, STATE.pendingExisting).finally(function () {
      btn.classList.remove("loading");
      btn.disabled = false;
    });
  }

  function deploy(dirHandle, existing) {
    var status = deployStatus();
    var catalogPath = ($("catalogPathInput").value || "~/.codex/models.json").trim();
    var configText = TomlMerge.buildConfig(existing, STATE.key, STATE.model, catalogPath);

    return dirHandle.getDirectoryHandle("backup-deepseek-web", { create: true }).then(function (backupDir) {
      var chain = Promise.resolve();
      if (existing) {
        chain = chain.then(function () { return writeFile(backupDir, "config.toml.backup", existing); });
      }
      return chain.then(function () {
        return writeFile(backupDir, "manifest.txt", "original_config_existed=" + (existing ? "1" : "0") + "\n");
      }).then(function () {
        return writeFile(dirHandle, "models.json", catalogText());
      }).then(function () {
        return writeFile(dirHandle, "config.toml", configText);
      });
    }).then(function () {
      STATE.deployed = true;
      $("deploySubActions").hidden = false;
      showStatus(status, "ok",
        "部署成功！\n\n已写入：config.toml、models.json\n已备份：backup-deepseek-web/config.toml.backup\n\n请重启 Codex 后即可使用 " + STATE.model + "。");
      toast("部署成功", "ok");
    }).catch(function (err) {
      showStatus(status, "err", "写入失败：" + err.message + "\n如果文件夹被占用或没有写权限，请改用方式 B 或 C。");
      toast("写入失败", "err");
    });
  }

  function restoreBackup() {
    var status = deployStatus();
    if (!STATE.dirHandle) {
      showStatus(status, "err", "请先重新选择 ~/.codex 文件夹。");
      toast("请先选择文件夹", "warn");
      return;
    }
    if (!window.confirm("确定恢复备份吗？当前 config.toml 和 models.json 会被替换/删除。")) {
      return;
    }
    STATE.dirHandle.getDirectoryHandle("backup-deepseek-web").then(function (backupDir) {
      return readFile(backupDir, "manifest.txt").then(function (manifest) {
        var hadOriginal = manifest !== null && /original_config_existed=1/.test(manifest);
        if (hadOriginal) {
          return readFile(backupDir, "config.toml.backup").then(function (backup) {
            if (backup === null) {
              showStatus(status, "err", "备份目录不完整：缺少 config.toml.backup。请手动检查 ~/.codex/backup-deepseek-web。");
              return;
            }
            return writeFile(STATE.dirHandle, "config.toml", backup)
              .then(function () { return deleteFile(STATE.dirHandle, "models.json"); })
              .then(function () {
                STATE.deployed = false;
                $("deploySubActions").hidden = true;
                showStatus(status, "ok", "已恢复备份。models.json 已删除，config.toml 已还原。");
                toast("已恢复备份", "ok");
              });
          });
        }
        // 部署前本来就没有配置：回滚 = 删除部署生成的文件
        return deleteFile(STATE.dirHandle, "config.toml")
          .then(function () { return deleteFile(STATE.dirHandle, "models.json"); })
          .then(function () {
            STATE.deployed = false;
            $("deploySubActions").hidden = true;
            showStatus(status, "ok", "已回滚到部署前状态：原无配置文件，已删除生成的 config.toml 与 models.json。");
            toast("已回滚", "ok");
          });
      });
    }).catch(function (err) {
      showStatus(status, "err", "恢复失败：" + err.message);
      toast("恢复失败", "err");
    });
  }

  function verifyDeployed() {
    var status = deployStatus();
    hideStatus(status);
    if (!STATE.key) {
      showStatus(status, "err", "缺少 Key，请回到步骤 3。");
      return;
    }
    var btn = $("btnVerifyDeployed");
    btn.classList.add("loading");
    btn.disabled = true;
    showStatus(status, "info", "正在验证…");
    fetch("https://api.deepseek.com/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + STATE.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: STATE.model,
        input: "ping",
        max_output_tokens: 8,
        stream: false
      })
    }).then(function (res) {
      if (res.ok) {
        showStatus(status, "ok", "连通成功，" + STATE.model + " 可正常响应。去重启 Codex 吧！");
        toast("连通成功", "ok");
      } else {
        showStatus(status, "err", "连通失败（HTTP " + res.status + "）。请检查 Key 或稍后再试。");
        toast("连通失败：HTTP " + res.status, "err");
      }
    }).catch(function (err) {
      showStatus(status, "err", "请求失败：" + err.message);
      toast("请求失败", "err");
    }).finally(function () {
      btn.classList.remove("loading");
      btn.disabled = false;
    });
  }

  // ---------- 方式 B：官方脚本 ----------

  function copyOfficialScript() {
    var cmd = "irm https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.ps1 | iex";
    var done = function () {
      var s = $("copyStatus");
      showStatus(s, "ok", "命令已复制：\n" + cmd + "\n\n打开 PowerShell 粘贴运行，按提示粘贴你的 API Key 即可（官方脚本会自动备份、校验、写入）。");
      toast("命令已复制到剪贴板", "ok");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(done, function () { fallbackCopy(cmd, done); });
    } else {
      fallbackCopy(cmd, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  // ---------- 方式 C：下载文件 ----------

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function downloadConfig() {
    var status = $("downloadStatus");
    if (!STATE.key) {
      showStatus(status, "err", "请先回到步骤 3 粘贴 API Key。");
      toast("请先完成步骤 3", "warn");
      setStep(3);
      return;
    }
    var file = $("existingConfigFile").files[0];
    if (file) {
      file.text().then(function (existing) {
        var text = TomlMerge.buildConfig(existing, STATE.key, STATE.model, "~/.codex/models.json");
        download("config.toml", text);
        showStatus(status, "ok", "已合并你选择的旧配置并下载 config.toml。");
        toast("config.toml 已下载", "ok");
      });
    } else {
      var fresh = TomlMerge.buildConfig(null, STATE.key, STATE.model, "~/.codex/models.json");
      download("config.toml", fresh);
      showStatus(status, "ok", "已下载全新 config.toml（未合并旧配置）。");
      toast("config.toml 已下载", "ok");
    }
  }

  function downloadModels() {
    download("models.json", catalogText(), "application/json");
    var status = $("downloadStatus");
    showStatus(status, "ok", "models.json 已下载。请把两个文件都放进 ~/.codex 目录（如已有文件请先备份）。");
    toast("models.json 已下载", "ok");
  }

  // ---------- 非电脑端检测 ----------

  function isMobileViewport() {
    var uaMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
    var narrow = window.matchMedia("(max-width: 960px)").matches;
    return uaMobile || narrow;
  }

  function updateMobileBlock() {
    var block = $("mobileBlock");
    var show = isMobileViewport();
    block.classList.toggle("show", show);
    document.body.style.overflow = show ? "hidden" : "";
  }

  // ---------- 绑定事件 ----------

  function bind() {
    $("btnOpenCodexSite").addEventListener("click", function () { openUrl(URLS.codex); });
    $("btnOpenChatGPTDownload").addEventListener("click", function () { openUrl(URLS.chatgptDownload); });
    $("btnOpenCliGuide").addEventListener("click", function () { openUrl(URLS.cli); });
    $("btnInstalled").addEventListener("click", function () { setStep(2); });

    $("btnOpenDeepSeek").addEventListener("click", function () { openUrl(URLS.deepseek); });
    $("btnLoggedIn").addEventListener("click", function () { setStep(3); });

    $("btnOpenApiKeys").addEventListener("click", function () { openUrl(URLS.apiKeys); });
    $("btnToggleKey").addEventListener("click", function () {
      var input = $("apiKeyInput");
      input.type = input.type === "password" ? "text" : "password";
      this.querySelector("svg").innerHTML = input.type === "password"
        ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
        : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
    });
    $("apiKeyInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        validateKey().then(function (ok) {
          if (ok) setStep(4);
        });
      }
    });
    $("btnValidateKey").addEventListener("click", function () {
      validateKey().then(function (ok) {
        if (ok) setStep(4);
      });
    });
    $("btnSkipValidate").addEventListener("click", function () {
      if (rememberKeyWithoutValidation()) setStep(4);
    });

    $("btnPickDir").addEventListener("click", pickAndDeploy);
    $("btnConfirmDeploy").addEventListener("click", confirmDeploy);
    $("btnVerifyDeployed").addEventListener("click", verifyDeployed);
    $("btnRestore").addEventListener("click", restoreBackup);
    $("btnCopyScript").addEventListener("click", copyOfficialScript);
    $("btnDownloadConfig").addEventListener("click", downloadConfig);
    $("btnDownloadModels").addEventListener("click", downloadModels);
    $("existingConfigFile").addEventListener("change", function () {
      var status = $("downloadStatus");
      var file = this.files[0];
      showStatus(status, "info", file ? "已选择：" + file.name + "，下载 config.toml 时会自动合并。" : "");
    });

    $("btnDeployDone").addEventListener("click", function () {
      if (!STATE.deployed && !window.confirm("还没确认部署成功（方式 A 写入完成、或方式 B/C 已按说明操作）。确定继续吗？")) {
        return;
      }
      setStep(5);
    });
    $("btnOpenCodexAgain").addEventListener("click", function () { openUrl(URLS.codex); });

    document.querySelectorAll(".method-card").forEach(function (card) {
      card.addEventListener("click", function () {
        document.querySelectorAll(".method-card").forEach(function (c) {
          c.classList.toggle("selected", c === card);
        });
      });
    });

    document.querySelectorAll(".side-step").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goToStep(Number(btn.getAttribute("data-step")));
      });
    });

    window.addEventListener("resize", updateMobileBlock);
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.DEEPSEEK_MODELS_CATALOG) {
      var s = $("deployStatus") || document.createElement("div");
      showStatus(s, "err", "models-data.js 未加载，请确认所有文件在同一目录。");
    }
    bind();
    updateMobileBlock();
    setStep(1);
  });
})();
