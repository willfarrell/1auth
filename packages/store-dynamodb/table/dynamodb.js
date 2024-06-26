export default (table, { timeToLiveKey } = {}) => {
  timeToLiveKey ??= 'remove'
  return {
    TableName: table,
    AttributeDefinitions: [
      {
        AttributeName: 'id',
        AttributeType: 'N'
      },
      {
        AttributeName: 'sub',
        AttributeType: 'S'
      }
      // {
      //   AttributeName: "expire",
      //   AttributeType: "N",
      // },
    ],
    KeySchema: [
      {
        AttributeName: 'id',
        KeyType: 'HASH'
      }
      // {
      //   AttributeName: "expire",
      //   KeyType: "RANGE",
      // },
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
          NonKeyAttributes: ['value', 'create', 'expire']
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
