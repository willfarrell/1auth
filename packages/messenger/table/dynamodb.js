export default (table = 'messengers', { timeToLiveKey } = {}) => {
  timeToLiveKey ??= 'remove'
  return {
    TableName: table,
    AttributeDefinitions: [
      {
        AttributeName: 'id',
        AttributeType: 'S'
      },
      {
        AttributeName: 'sub',
        AttributeType: 'S'
      },
      {
        AttributeName: 'type',
        AttributeType: 'S'
      },
      {
        AttributeName: 'digest',
        AttributeType: 'S'
      }
      // {
      //   AttributeName: "expire",
      //   AttributeType: "N",
      // },
    ],
    KeySchema: [
      {
        AttributeName: 'sub',
        KeyType: 'HASH'
      },
      {
        AttributeName: 'id',
        KeyType: 'RANGE'
      }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'sub',
        KeySchema: [
          {
            AttributeName: 'sub',
            KeyType: 'HASH'
          }
        ],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['id', 'name', 'encryptionKey', 'value', 'verify']
        }
      },
      {
        IndexName: 'digest',
        KeySchema: [
          {
            AttributeName: 'digest',
            KeyType: 'HASH'
          }
        ],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['id', 'sub', 'encryptionKey', 'value', 'verify']
        }
      }
    ],
    TimeToLiveSpecification: {
      Enabled: true,
      AttributeName: timeToLiveKey
    },
    BillingMode: 'PAY_PER_REQUEST'
  }
}
