import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';

@EventSubscriber()
export class UuidV7Subscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<any>) {
    if (event.entity && !event.entity.id) {
      event.entity.id = uuidv7();
    }
  }
}
