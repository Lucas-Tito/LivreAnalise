import type { SaveDialogOptions } from 'electron'

// No Linux o diálogo de salvar do Electron não pergunta antes de sobrescrever um
// arquivo que já existe -- ao contrário do Windows e do macOS, onde a pergunta
// é padrão. Todo showSaveDialog do app passa por aqui para pedir a confirmação.
export const SAVE_DIALOG_PROPERTIES: SaveDialogOptions['properties'] = [
  'showOverwriteConfirmation',
  'createDirectory'
]
