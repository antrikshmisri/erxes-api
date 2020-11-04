import { IShapeDocument } from '../../models/definitions/Automations';
import messageBroker from '../../messageBroker';

const sendNotification = async (shape: IShapeDocument, data: any) => {
  const objectData = data.doc;

  const doc = {
    createdUser: '',
    receivers: [data.userId],
    title: shape.config.title,
    content: shape.config.content,
    notifType: shape.config.notifType,
    link: shape.config.link.concat(objectData._id),
    action: shape.config.action,
    contentType: shape.config.contentType,
    contentTypeId: objectData._id,
  };

  return messageBroker().sendRPCMessage('rpc_queue:erxes-automations', {
    action: 'send-notifications',
    payload: JSON.stringify(doc),
  });
};

export default sendNotification;
