// A versao vem do package.json e de lugar nenhum mais. E ela que nomeia a tag da
// release e os instaladores, entao qualquer copia escrita a mao sai de sincronia
// sem ninguem perceber -- ja aconteceu com o APP_ORIGIN do QDPX, que ficou em
// 0.1.0 e carimbava essa versao em todo projeto exportado.
import { version } from '../../package.json'

export const APP_VERSION = version
