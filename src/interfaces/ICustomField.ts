import { CustomFieldsTypeEnum } from 'enums/CustomFieldsTypeEnum';
import { CustomFieldsEntityTypeEnum } from 'enums/CustomFieldsEntityTypeEnum';

interface enumValues {
  id: number,
  value: string,
  code: string|null,
  sort: number,
}

export interface ICustomField {
  id: number,
  name: string,
  code: string,
  type: CustomFieldsTypeEnum,
  entity_type: CustomFieldsEntityTypeEnum,
  is_computed: boolean,
  is_predefined: boolean,
  is_deletable: boolean,
  is_visible: boolean,
  is_required: boolean,
  enums?: enumValues[],
}
