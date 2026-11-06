/** A choice of the « À faire » forms: a responsible, or a project (with its members). */
export interface TodoOption {
  id: string;
  name: string;
  /** Projects only: active member ids (who a project task can go to). */
  memberIds?: string[];
}
