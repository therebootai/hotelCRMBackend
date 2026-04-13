export enum EApplicationEnvironment {
  PRODUCTION = 'production',
  DEVELOPMENT = 'development'
}

export const responseMessage = {
  SUCCESS: 'The request has been suuccefful',
  SOMETHING_WENT_WRONG: 'Something went wrong',
  NOT_FOUND: (name: string) => `${name} not found`
}