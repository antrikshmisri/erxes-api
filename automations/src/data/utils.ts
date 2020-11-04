import { debugBase } from '../debuggers';
import { Automations, Shapes } from '../models';
import { AUTOMATION_STATUS, AUTOMATION_TYPE, TRIGGER_KIND } from '../models/definitions/constants';
import { asyncAutomationRunner, bgAutomationRunner } from './runnerHelper';
import { changeDeal } from './triggers/changeDeal';

const getMainSelector = async kind => {
  const publishedAutomationIds = await Automations.find({ status: AUTOMATION_STATUS.PUBLISH }, { _id: 1 });
  return {
    automationId: { $in: publishedAutomationIds.map(item => item._id) },
    kind,
    type: AUTOMATION_TYPE.TRIGGER,
  };
};

export const checkTrigger = async (postData: any): Promise<any> => {
  const kind = postData.kind;

  if (!TRIGGER_KIND.ALL.includes(kind)) {
    return { error: 'wrong kind' };
  }

  let configFilter = {};
  const result = { bgTriggers: [], response: [] };

  switch (kind) {
    case TRIGGER_KIND.CHANGE_DEAL: {
      configFilter = changeDeal(postData);
      break;
    }

    default:
      configFilter = {};
  }

  const asyncTriggers = await Shapes.find({
    ...(await getMainSelector(kind)),
    config: { ...configFilter },
    async: true,
  });

  const syncTriggers = await Shapes.find({
    ...(await getMainSelector(kind)),
    config: { ...configFilter },
    async: false,
  });

  // sync triggers command start
  if (syncTriggers.length > 0) {
    for (const trigger of syncTriggers) {
      result.bgTriggers.push(trigger.kind);
      bgAutomationRunner(trigger, postData)
        .then(() => {
          debugBase(`Success background automation runner ${trigger._id} ${trigger.kind}`);
        })
        .catch(() => {
          debugBase(`Unsuccess background automation runner ${trigger._id} ${trigger.kind}`);
        });
    }
  }

  if (asyncTriggers.length === 0) {
    return result;
  }

  // async triggers command response return
  for (const trigger of asyncTriggers) {
    result.response.push(await asyncAutomationRunner(trigger, postData));
  }

  return result;
};
