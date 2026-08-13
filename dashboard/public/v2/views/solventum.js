// Solventum chargeback workflow — AP/clerk-side only.

import { el, icon, toast } from '../app.js';
import { runSolventum, solventumDownloadUrl, uploadSolventumFile } from '../api.js';

const SALES_EXTENSIONS = new Set(['xlsx', 'xls']);
const fileExtension = (file) => String(file.name || '').split('.').pop().toLowerCase();
const fileKind = (file) => SALES_EXTENSIONS.has(fileExtension(file)) ? 'sales' : fileExtension(file) === 'pdf' ? 'pod' : 'invalid';
const fileSize = (bytes) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export async function mount(view) {
  const state = { files: [], running: false, result: null };

  const head = el('div', { class: 'page-head' }, [
    el('h1', { class: 'h2 page-head__title', text: 'Solventum chargeback' }),
    el('p', { class: 'body-s muted page-head__caption',
      text: 'Generate a chargeback containing only sales lines supported by uploaded PODs.' }),
  ]);

  const input = el('input', { type: 'file', accept: '.xlsx,.xls,.pdf', multiple: true, class: 'sr-only' });
  const choose = el('button', { class: 'btn btn--secondary', type: 'button' }, [icon('paperclip'), 'Add files']);
  const drop = el('div', { class: 'solventum-drop' }, [
    icon('inbox', { size: 24 }),
    el('div', { class: 'stack gap-1' }, [
      el('div', { class: 'h5', text: 'Add the sales workbook and POD PDFs' }),
      el('div', { class: 'body-s muted', text: 'Drop files here, or add them in one or more selections.' }),
    ]),
    choose,
    input,
  ]);
  const fileList = el('div', { class: 'solventum-files', 'aria-live': 'polite' });
  const validation = el('div', { class: 'body-s solventum-validation', 'aria-live': 'polite' });
  const runButton = el('button', { class: 'btn btn--primary', type: 'button', disabled: true }, [icon('play'), 'Run']);
  const actions = el('div', { class: 'solventum-actions' }, [validation, runButton]);
  const resultHost = el('div');
  const workflow = el('section', { class: 'card solventum-workflow', 'aria-label': 'Solventum input files' }, [
    el('div', { class: 'solventum-instructions' }, [
      el('div', {}, [
        el('div', { class: 'h5', text: 'Required inputs' }),
        el('p', { class: 'body-s muted', text: 'Exactly one JUNE SALES workbook (.xlsx or .xls), plus one or more POD PDFs. POD invoice numbers are read from filenames.' }),
      ]),
      el('span', { class: 'badge badge--info', text: 'POD-backed invoices only' }),
    ]),
    drop,
    fileList,
    actions,
  ]);
  view.replaceChildren(head, workflow, resultHost);

  function addFiles(files) {
    for (const file of files) {
      if (fileKind(file) === 'invalid') {
        toast(`${file.name} is not an Excel workbook or PDF.`, 'error');
        continue;
      }
      state.files.push({ key: crypto.randomUUID(), file });
    }
    state.result = null;
    render();
  }

  function gate() {
    const workbookCount = state.files.filter(({ file }) => fileKind(file) === 'sales').length;
    const podCount = state.files.filter(({ file }) => fileKind(file) === 'pod').length;
    if (workbookCount > 1) return { ready: false, message: `${workbookCount} sales workbooks added. Remove all but one to run.`, error: true };
    if (workbookCount === 0) return { ready: false, message: 'Add one sales workbook to continue.' };
    if (podCount === 0) return { ready: false, message: 'Add at least one POD PDF to continue.' };
    return { ready: true, message: `Ready: 1 sales workbook and ${podCount} POD PDF${podCount === 1 ? '' : 's'}.` };
  }

  function render() {
    fileList.replaceChildren();
    if (!state.files.length) {
      fileList.append(el('div', { class: 'solventum-empty body-s muted', text: 'No files added yet.' }));
    } else {
      state.files.forEach(({ key, file }) => {
        const kind = fileKind(file);
        const remove = el('button', { class: 'btn btn--ghost btn--sm', type: 'button',
          'aria-label': `Remove ${file.name}`, title: `Remove ${file.name}`, disabled: state.running }, [icon('x'), 'Remove']);
        remove.addEventListener('click', () => {
          state.files = state.files.filter((entry) => entry.key !== key);
          state.result = null;
          render();
        });
        fileList.append(el('div', { class: 'solventum-file' }, [
          icon(kind === 'sales' ? 'file-spreadsheet' : 'file-text'),
          el('div', { class: 'solventum-file__name' }, [
            el('strong', { text: file.name }),
            el('span', { class: 'caption muted', text: `${kind === 'sales' ? 'Sales workbook' : 'POD PDF'} · ${fileSize(file.size)}` }),
          ]),
          remove,
        ]));
      });
    }
    const status = gate();
    validation.textContent = status.message;
    validation.classList.toggle('is-error', !!status.error);
    runButton.disabled = !status.ready || state.running;
    runButton.replaceChildren(icon(state.running ? 'loader' : 'play', { spin: state.running }), state.running ? 'Generating…' : 'Run');
    choose.disabled = state.running;
    input.disabled = state.running;
    resultHost.replaceChildren();
    if (state.result) {
      resultHost.append(el('section', { class: 'card solventum-result' }, [
        el('div', { class: 'solventum-result__copy' }, [
          el('div', { class: 'h5', text: 'Chargeback ready' }),
          el('div', { class: 'body-s muted', text: `${state.result.row_count} POD-backed sales line${state.result.row_count === 1 ? '' : 's'} included.` }),
        ]),
        el('a', { class: 'btn btn--primary btn--download', href: solventumDownloadUrl(state.result.upload_id) }, [icon('download'), 'Download chargeback']),
      ]));
    }
  }

  async function run() {
    if (!gate().ready || state.running) return;
    state.running = true;
    state.result = null;
    render();
    try {
      let uploadId = null;
      for (const { file } of state.files) {
        const uploaded = await uploadSolventumFile(file, uploadId);
        uploadId = uploaded.upload_id;
      }
      state.result = await runSolventum(uploadId);
      toast('Solventum chargeback generated.', 'ok');
    } catch (error) {
      toast(error.message || 'Chargeback generation failed. Check the files and try again.', 'error');
    } finally {
      state.running = false;
      render();
    }
  }

  choose.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { addFiles(Array.from(input.files || [])); input.value = ''; });
  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    addFiles(Array.from(event.dataTransfer.files || []));
  });
  runButton.addEventListener('click', run);
  render();
}
