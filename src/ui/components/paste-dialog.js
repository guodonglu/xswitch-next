import { el, button, field } from './dom.js';
import { inspectPastedInput } from '../../core/import-format.js';

export function pasteDialog({
  title = '粘贴规则',
  showNameInput = false,
  initialName = '',
  initialText = '',
  confirmLabel = '确定',
}) {
  return new Promise((resolve) => {
    let currentName = initialName;

    const nameInput = showNameInput
      ? el('input', {
          class: 'input',
          value: initialName,
          placeholder: '例如：本地联调（可选）',
          maxlength: 200,
          onInput: (e) => { currentName = e.target.value; },
        })
      : null;

    const textarea = el('textarea', {
      class: 'input font-mono text-xs leading-5 h-36 resize-y w-full',
      placeholder: '粘贴 XSwitch 规则 JSON，例如：\n{\n  "proxy": [\n    ["https://example.com/a.js", "http://localhost:3000/a.js"]\n  ]\n}',
      onInput: () => {
        updatePreview();
      },
    });
    textarea.value = initialText;

    const previewMsg = el('div', { class: 'min-h-[20px] text-xs' });

    const pasteFromClipboardBtn = button('读取剪贴板', async () => {
      try {
        const text = await navigator.clipboard?.readText();
        if (text) {
          textarea.value = text;
          updatePreview();
        }
      } catch {
        previewMsg.replaceChildren(el('span', { class: 'text-error' }, '读取剪贴板受限，请直接在下方 Ctrl+V 粘贴'));
      }
    }, 'text-xs border border-border bg-transparent py-1 px-2 text-text-secondary hover:text-primary rounded');

    const confirmBtn = button(confirmLabel, () => {
      submit();
    }, 'btn-primary');

    function updatePreview() {
      const text = textarea.value.trim();
      if (!text) {
        if (showNameInput) {
          previewMsg.replaceChildren(el('span', { class: 'muted' }, '未填写规则内容时将创建空规则组'));
          confirmBtn.disabled = false;
          confirmBtn.textContent = confirmLabel;
        } else {
          previewMsg.replaceChildren(el('span', { class: 'muted' }, '请粘贴规则 JSON'));
          confirmBtn.disabled = true;
          confirmBtn.textContent = confirmLabel;
        }
        return;
      }

      const inspection = inspectPastedInput(text);
      if (inspection.valid) {
        previewMsg.replaceChildren(
          el('span', { class: 'text-primary font-medium' }, `✓ 识别到 ${inspection.summary}`)
        );
        confirmBtn.disabled = false;
        confirmBtn.textContent = showNameInput ? confirmLabel : `${confirmLabel} (${inspection.count} 条)`;
        if (showNameInput && nameInput && !nameInput.value.trim() && inspection.groupName) {
          nameInput.value = inspection.groupName;
          currentName = inspection.groupName;
        }
      } else {
        previewMsg.replaceChildren(
          el('span', { class: 'text-error' }, `无法解析: ${inspection.error}`)
        );
        confirmBtn.disabled = !showNameInput;
        confirmBtn.textContent = confirmLabel;
      }
    }

    function submit() {
      const text = textarea.value.trim();
      if (!text && !showNameInput) {
        textarea.reportValidity();
        return;
      }
      if (text) {
        const inspection = inspectPastedInput(text);
        if (!inspection.valid) {
          previewMsg.replaceChildren(el('span', { class: 'text-error' }, `请检查内容: ${inspection.error}`));
          return;
        }
        answer = {
          name: nameInput?.value.trim() || currentName.trim() || inspection.groupName || '',
          text,
          inferredName: inspection.groupName,
          count: inspection.count,
          inspection,
        };
      } else {
        answer = {
          name: nameInput?.value.trim() || '新建规则组',
          text: '',
          count: 0,
        };
      }
      modal.close();
    }

    const form = el('form', { method: 'dialog', class: 'space-y-3' },
      el('div', { class: 'flex items-center justify-between gap-2' },
        el('h2', { id: 'dialog-title', class: 'font-semibold text-sm' }, title),
        pasteFromClipboardBtn
      ),
      nameInput && field('规则组名称', nameInput),
      field('规则内容 (XSwitch JSON)', textarea),
      previewMsg,
      el('div', { class: 'flex justify-end gap-2 pt-1' },
        button('取消', () => modal.close(), 'btn'),
        confirmBtn
      )
    );

    const modal = el('dialog', {
      class: 'panel m-auto w-[calc(100%-2rem)] max-w-md p-5 text-text-primary shadow-xl backdrop:bg-black/60',
      'aria-labelledby': 'dialog-title',
    }, form);

    let answer = null;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });

    modal.addEventListener('close', () => {
      modal.remove();
      resolve(answer);
    }, { once: true });

    document.body.append(modal);
    modal.showModal();
    updatePreview();
    (nameInput ?? textarea).focus();
  });
}
