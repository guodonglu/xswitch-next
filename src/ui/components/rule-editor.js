import { el, button, field } from './dom.js';
export function createRuleEditor({ rule, groupId, revision, save, cancel }) {
  const source = el('input', { class: 'input font-mono', value: rule?.match?.value ?? '', required: true, placeholder: 'example.com/app.js', spellcheck: 'false' });
  const destination = el('input', { class: 'input font-mono', value: rule?.destination?.value ?? '', placeholder: 'http://127.0.0.1:3000/app.js', spellcheck: 'false' });
  const name = el('input', { class: 'input', value: rule?.name ?? '', placeholder: '例如：本地开发', maxlength: 200 });
  const mode = el('select', { class: 'input' }, el('option', { value: 'contains' }, '包含'), el('option', { value: 'regex' }, '正则表达式'));
  mode.value = rule?.match?.mode ?? 'contains';
  const type = rule?.type ?? 'redirect';
  const cors = el('input', { type: 'checkbox', checked: rule?.options?.cors ?? false, class: 'accent-indigo-600' });
  const error = el('p', { class: 'text-xs leading-5 text-red-600 dark:text-red-400', role: 'alert' });
  const form = el('form', { class: 'panel space-y-3 border-indigo-300 p-3 dark:border-indigo-800', 'aria-label': '规则编辑器' },
    el('h3', { class: 'text-sm font-semibold' }, rule?.id ? '编辑规则' : `添加${type === 'redirect' ? '请求转发' : '允许跨域'}`),
    field('规则名称', name), field('匹配地址', source), field('匹配方式', mode));
  if (type === 'redirect') form.append(field('转发到', destination),
    el('label', { class: 'flex items-center gap-2 text-xs' }, cors, '允许跨域'));
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, '保存');
  form.append(error, el('div', { class: 'flex justify-end gap-2' }, button('取消', cancel), submit));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); error.textContent = '';
    if (mode.value === 'regex') {
      try { new RegExp(source.value); } catch (failure) { error.textContent = `正则表达式无效：${failure.message}`; source.focus(); return; }
    }
    submit.disabled = true; submit.textContent = '保存中…';
    try {
      const payload = { groupId, type, name: name.value.trim() || (type === 'redirect' ? '请求转发' : '允许跨域'),
        destination: destination.value, enableCors: cors.checked, expectedRevision: revision };
      // Preserve imported legacy semantics when the matching fields have not changed.
      if (!rule?.id || source.value !== rule.match.value) payload.source = source.value;
      if (!rule?.id || mode.value !== rule.match.mode) payload.matchMode = mode.value;
      if (rule?.id) payload.ruleId = rule.id;
      await save(rule?.id ? 'RULE_UPDATE' : 'RULE_CREATE', payload);
    } catch (failure) { error.textContent = failure.message; }
    finally { submit.disabled = false; submit.textContent = '保存'; }
  });
  return form;
}
