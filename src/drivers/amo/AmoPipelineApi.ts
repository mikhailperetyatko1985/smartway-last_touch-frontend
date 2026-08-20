import axios from 'axios';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { IPipelineApi } from 'interfaces/IPipelineApi';
import { ICustomField } from 'interfaces/ICustomField';

const api = {
  pipeline: '/api/v4/leads/pipelines',
  leadsCustomFields: '/api/v4/leads/custom_fields',
};

interface IPipelineStatus {
  id: number;
  name: string,
}

interface IPipeline {
  id: number;
  name: string,
  _embedded: {
    statuses: IPipelineStatus[],
  }
}

interface IResponsePipelines {
  _embedded: {
    pipelines: IPipeline[],
  }
}

interface IResponseCustomFields {
  _total_items: number;
  _page: number;
  _page_count: number;
  _embedded: {
    custom_fields: ICustomField[],
  }
}

//@ts-ignore
if (!window.amo_api_cache) {
  //@ts-ignore
  window.amo_api_cache = {};
}

const { getWidget } = useAmoCrmStore();

export class AmoPipelineApi implements IPipelineApi {
  async list() {
    try {
      const { data } = await axios.get<IResponsePipelines>(api.pipeline);
      return data._embedded.pipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        statuses: pipeline._embedded.statuses.map((status) => ({
          id: status.id,
          name: status.name,
        })),
      }));
    } catch (e) {
      getWidget.value?.app.notifications.show_message_error({ header: 'Произошла непредвиденная ошибка', text: '' });
      return [];
    }
  }
  async leadsCustomFields() {
    const cacheKey = 'leadsCustomFields';
    //@ts-ignore
    if (window.amo_api_cache?.[cacheKey]?.ttl > Date.now()) {
      //@ts-ignore
      return window.amo_api_cache[cacheKey].data;
    }

    let page = 1;
    let hasNextPage = true;
    const customFields: ICustomField[] = [];

    while(hasNextPage) {
      try {
        const { data } = await axios.get<IResponseCustomFields>(`${api.leadsCustomFields}?page=${page}&limit=250`);
        customFields.push(...data._embedded.custom_fields);
        hasNextPage = data._page < data._page_count;
        page++;
      } catch (e) {
        getWidget.value?.app.notifications.show_message_error({ header: 'Произошла непредвиденная ошибка при получении списка кастомных полей', text: '' });
        hasNextPage = false;
        //@ts-ignore
        delete window.amo_api_cache[cacheKey];
      }
    }

    //@ts-ignore
    window.amo_api_cache[cacheKey] = {
      ttl: Date.now() + 15000,
      data: customFields,
    };

    return customFields;
  }
}