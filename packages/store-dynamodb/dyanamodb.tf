/*
sub
username
encryptionKey
privateKey # for signatures (encrypted)
publicKey # for signatures
name # pii (encrypted)
agreements-*
notifications
create
update
*/
resource "aws_dynamodb_table" "accounts" {
  name = "accounts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "sub"
  
  attribute {
	  name = "sub"
	  type = "S"
  }
  
  # Used to look up sub for authentication
  global_secondary_index {
    name            = "digest"
    hash_key        = "digest"
    projection_type = "INCLUDE"
    non_key_attributes = [
      "sub"
    ]
  }
  
  attribute {
    name = "digest"
    type = "S"
  }
  
  server_side_encryption {
	enabled = true
  }
  
  point_in_time_recovery {
	enabled = true
  }
  
}

/*
id
sub
encryptionKey
value # metadata (encrypted)
create
update
expire
*/
resource "aws_dynamodb_table" "sessions" {
  name = "sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  
  attribute {
	  name = "id"
	  type = "S"
  }
  
  # Lookup list of sessions
  global_secondary_index {
    name            = "sub"
	  hash_key        = "sub"
	  projection_type = "INCLUDE"
	  non_key_attributes = [
	    "value","create","expire"
	  ]
  }
  
  attribute {
	  name = "sub"
	  type = "S"
  }
  
  ttl {
	  attribute_name = "ttl"
	  enabled = true
  }
  
  server_side_encryption {
	 enabled = true
  }
  
  point_in_time_recovery {
	 enabled = true
  }
  
}

/*
id
sub
type: {}
encryptionKey
value (encrypted)
create
update
verify
expire
*/
resource "aws_dynamodb_table" "credentials" {
  name = "credentials"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  range_key = "sub"
  
  attribute {
	  name = "id"
	  type = "S"
  }
  
  global_secondary_index {
    name            = "sub"
	  hash_key        = "sub"
	  range_key        = "type"
	  projection_type = "INCLUDE"
	  non_key_attributes = [
	    "encryptionKey", "value", "name", "create", "expire", "verify",
        "lastused", "challenge" # For WebAuthn
	  ]
  }
  
  attribute {
	  name = "sub"
	  type = "S"
  }
  
  attribute {
	  name = "type"
	  type = "S"
  }
  
  ttl {
	  attribute_name = "ttl"
	  enabled = true
  }
  
  server_side_encryption {
	enabled = true
  }
  
  point_in_time_recovery {
	enabled = true
  }
  
  
  
}

/*
id
sub
type: {emailAddress,phoneNumber,webPush,webSocket}
name
encryptionKey
value (encrypted)
digest
create
update
verify
*/
resource "aws_dynamodb_table" "messengers" {
  name = "messengers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  range_key = "sub"
  
  attribute {
	  name = "id"
	  type = "S"
  }
  
  # list messengers
  global_secondary_index {
    name            = "sub"
    hash_key        = "sub"
    range_key        = "type"
	  projection_type = "INCLUDE"
	  non_key_attributes = [
	    "id", "name", "encryptionKey","value","verify"
	  ]
  }
  
  attribute {
    name = "sub"
    type = "S"
  }
  attribute {
    name = "type"
    type = "S"
  }
  
  # search for messengers
  global_secondary_index {
    name            = "digest"
	  hash_key        = "digest"
	  projection_type = "INCLUDE"
	  non_key_attributes = [
	    "id","sub","encryptionKey","value","verify"
	  ]
  }
  
  attribute {
	  name = "digest"
	  type = "S"
  }
  
  server_side_encryption {
	 enabled = true
  }
  
  point_in_time_recovery {
	 enabled = true
  }
  
}

/*
parent - parent id, prefix w/ org-, data-, team-
child - child id {dataset suffix, sub-}
type - relationship type / group of roles org-team
role - child relationship parent 
create
update

dataset n-1 org 1-n team n-n sub
                n-n sub
*/
resource "aws_dynamodb_table" "authorizations" {
  name = "authorizations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  
  attribute {
    name = "id"
    type = "S"
  }
  
  attribute {
    name = "type"
    type = "S"
  }
  
  global_secondary_index {
    name            = "parent"
    hash_key        = "parent"
    range_key       = "type"
    projection_type = "INCLUDE"
    non_key_attributes = [
      "id","role","create","update"
    ]
  }
  
  attribute {
    name = "parent"
    type = "S"
  }
  
  global_secondary_index {
    name            = "child"
    hash_key        = "child"
    range_key       = "type"
    projection_type = "INCLUDE"
    non_key_attributes = [
      "id","role","create","update"
    ]
  }
  
  attribute {
    name = "child"
    type = "S"
  }
  
  
  /*hash_key = "key"
  range_key = "parent"

  attribute {
	name = "id"
	type = "S"
  }

  attribute {
	name = "parent"
	type = "S"
  }

  attribute {
	name = "role"
	type = "S"
  }
  attribute {
	name = "type"
	type = "S"
  }
  */

  server_side_encryption {
	  enabled = true
  }

  point_in_time_recovery {
	  enabled = true
  }

}

/*
id
name
type
urlWebsite

*/
resource "aws_dynamodb_table" "organizations" {
  name = "organizations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  
  attribute {
	  name = "id"
	  type = "S"
  }
    
  server_side_encryption {
	  enabled = true
  }
  
  point_in_time_recovery {
	  enabled = true
  }
  
}

/*
id - org id
encryptionKey
value (encrypted) - emailAddress
digest
role - encrypted json
create
update - to trigger re-send
expire (not for ttl)
*/
resource "aws_dynamodb_table" "invites" {
  name = "invites"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  
  attribute {
    name = "id"
    type = "S"
  }
  
  # search for messengers
  global_secondary_index {
    name            = "digest"
    hash_key        = "digest"
    projection_type = "INCLUDE"
    non_key_attributes = [
      "id","encryptionKey","value","create","expire"
    ]
  }
  
  attribute {
    name = "digest"
    type = "S"
  }
    
  server_side_encryption {
    enabled = true
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
}

/*
id
version
...
digest
signature
create - v0.0.0 create
first_publish - v1.0.0 
embargo
publish

*/
resource "aws_dynamodb_table" "datasets" {
  name = "datasets"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  #range_key = "version" # work with semver?
  
  attribute {
	  name = "id" # suffix
	  type = "S"
  }
	
  server_side_encryption {
	  enabled = true
  }
  
  point_in_time_recovery {
	  enabled = true
  }
  
}
/*
id
version
...
create - first change - used to get patches
update - last change - used to get patches

*/
resource "aws_dynamodb_table" "datasetVersions" {
  name = "datasetVersions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  #range_key = "version" # work with semver?
  
  attribute {
	  name = "id" # suffix
	  type = "S"
  }
	
  server_side_encryption {
	  enabled = true
  }
  
  point_in_time_recovery {
	  enabled = true
  }
}

/*
id
patch # JSON Patch
digest
sub
signature # future
create
verify
*/
# datasets
resource "aws_dynamodb_table" "datasetPatches" {
  name = "datasetPatches"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  #range_key = "create"
  
  attribute {
	  name = "id" # suffix
	  type = "S"
  }
	
  server_side_encryption {
	  enabled = true
  }
  
  point_in_time_recovery {
	  enabled = true
  }
}

/*
id
event # { type,  }
digest
sub
signature # future
create
verify
*/
# events