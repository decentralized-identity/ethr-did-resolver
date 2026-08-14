/// <reference types="vite/client" />

declare module '*.json' {
  const value: {
    abi: unknown[]
    bytecode: string
  }
  export default value
}
