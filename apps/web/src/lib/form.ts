/** Read a text field from FormData ('' if missing or a File). */
export function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
