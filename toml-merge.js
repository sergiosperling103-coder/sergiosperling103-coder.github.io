/**
 * 极简 TOML 合并器：只管理 Codex × DeepSeek 需要的字段，
 * 其余配置（MCP、信任级别、其他 provider 等）原样保留。
 * 同时支持浏览器（window.TomlMerge）与 Node（module.exports）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TomlMerge = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MANAGED_TOP_KEYS = [
    "model",
    "model_provider",
    "preferred_auth_method",
    "forced_login_method",
    "model_reasoning_effort",
    "model_catalog_json"
  ];

  /**
   * 解析 TOML 表头，返回表名；支持 [[数组表]] 和行尾注释。
   * 例如 "[mcp_servers.foo] # 注释" -> "mcp_servers.foo"
   */
  function headerName(line) {
    var t = line.trim();
    var m = t.match(/^\[{1,2}([^\]]+)\]{1,2}\s*(?:#.*)?$/);
    return m ? m[1].trim() : null;
  }

  function isDeepseekTable(name) {
    return name === "model_providers.deepseek" ||
      (name !== null && name.indexOf("model_providers.deepseek.") === 0);
  }

  function providerTable(apiKey) {
    return [
      "[model_providers.deepseek]",
      'name = "deepseek"',
      'base_url = "https://api.deepseek.com/"',
      'wire_api = "responses"',
      "experimental_bearer_token = " + JSON.stringify(apiKey)
    ];
  }

  /**
   * @param {string|null} existing  现有 config.toml 内容，没有则为 null
   * @param {string} apiKey         DeepSeek API Key
   * @param {string} model          模型 slug
   * @param {string} catalogPath    models.json 路径（建议 Windows 用完整路径）
   * @returns {string} 合并后的 config.toml 内容
   */
  function buildConfig(existing, apiKey, model, catalogPath) {
    var topValues = {
      model: JSON.stringify(model),
      model_provider: '"deepseek"',
      preferred_auth_method: '"apikey"',
      forced_login_method: '"api"',
      model_reasoning_effort: '"high"',
      model_catalog_json: JSON.stringify(catalogPath || "~/.codex/models.json")
    };

    var head = [
      "# Codex × DeepSeek 一键配置（由配置助手生成）",
      "# 如需恢复原配置，请使用页面上的“恢复备份”功能"
    ];
    var insert = MANAGED_TOP_KEYS.map(function (key) {
      return key + " = " + topValues[key];
    });

    if (!existing || existing.trim() === "") {
      return head.concat(insert, "", providerTable(apiKey), "").join("\n");
    }

    var lines = existing.split(/\r?\n/);
    var out = [];
    var inTop = true;
    var skippingDeepseek = false;
    var firstTableIndex = -1;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      var hName = headerName(line);
      var isHeader = hName !== null;

      if (isHeader && !skippingDeepseek && firstTableIndex < 0) {
        firstTableIndex = out.length;
      }

      if (skippingDeepseek) {
        if (isHeader && !isDeepseekTable(hName)) {
          skippingDeepseek = false;
        } else {
          continue;
        }
      }

      if (isDeepseekTable(hName)) {
        skippingDeepseek = true;
        continue;
      }

      if (inTop) {
        var m = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=/);
        if (m && MANAGED_TOP_KEYS.indexOf(m[1]) !== -1) {
          continue; // 丢弃旧的受管字段，稍后统一写入新值
        }
        out.push(line);
        if (isHeader) {
          inTop = false;
        }
        continue;
      }

      out.push(line);
    }

    if (firstTableIndex < 0) {
      firstTableIndex = out.length;
    }

    var prefix = out.slice(0, firstTableIndex);
    while (prefix.length && prefix[prefix.length - 1].trim() === "") {
      prefix.pop();
    }
    var result = prefix.concat(insert, "", out.slice(firstTableIndex));

    var text = result.join("\n").replace(/\s+$/, "");
    return text + "\n\n" + providerTable(apiKey).join("\n") + "\n";
  }

  return {
    buildConfig: buildConfig,
    providerTable: providerTable
  };
});
