import _ from 'lodash/fp'
import downloadFlix from '../util/downloadFlix'

import { jobs } from './jobs'
import * as socket from './socket'

const path = require('path')
const ChildProcess = require('child_process')
const globby = require('globby')

let flixInstance: any
let port = 8888

export interface StartEngineInput {
  rootPath: string,
  extensionPath: string,
  globalStoragePath: string
}

export async function start ({ rootPath, extensionPath, globalStoragePath }: StartEngineInput) {
  if (flixInstance || socket.isOpen()) {
    stop()
  }

  async function handleOpen () {
    const workspaceFiles = await globby('**/*.flix', { cwd: rootPath, gitignore: true, absolute: true })
    console.log({workspaceFiles}) // TODO: Add to compiler as a job
  }

  try {
    await downloadFlix({ targetPath: globalStoragePath, skipIfExists: true })
  } catch (err) {
    throw 'Could not download flix - refusing to start'
  }

  flixInstance = ChildProcess.spawn('java', ['-jar', path.join(extensionPath, 'flix.jar'), '--lsp', port])
  const webSocketUrl = `ws://localhost:${port}`

  flixInstance.stdout.on('data', (data: any) => {
    const str = data.toString().split(/(\r?\n)/g).join('')

    if(str.includes(webSocketUrl)) {
      // initialise websocket, listening to messages and what not
      socket.initialiseSocket({ 
        uri: webSocketUrl,
        onOpen: handleOpen
      })

      // now that the connection is established, there's no reason to listen for new messages
      flixInstance.stdout.removeAllListeners('data')
    }
  })

  flixInstance.stderr.on('data', (data: any) => {
    // Text on missing/inaccessible: 'Error: Unable to access jarfile'
    const str = data.toString().split(/(\r?\n)/g).join('')
    console.error('[error]', str)
  })
}

export function stop () {
  if (flixInstance) {
    flixInstance.kill()
  }
  socket.closeSocket()
}

export interface ValidateInput {
  uri: String
  src: String
}

// https://github.com/flix/flix/blob/master/main/src/ca/uwaterloo/flix/api/lsp/LanguageServer.scala#L166
export function validate ({ uri, src }: ValidateInput, retries = 0) {
  // this is a step on the way to performing code checks
  // we send a message with an id and add it to `jobs` to know what to do when it returns
  // will have to be fleshed out further
  const id = '1'
  const message = {
    request: 'api/addUri',
    uri,
    src,
    id
  }
  jobs[id] = message
  socket.sendMessage(message)
}
