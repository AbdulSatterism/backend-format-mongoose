export type TErrorSource = {
  path: string | number;
  message: string;
}[];

export type TGenericErrorResponse = {
  status_code: number;
  message: string;
  errorSources: TErrorSource;
};
