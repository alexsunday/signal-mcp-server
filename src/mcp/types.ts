import { z } from "zod";

export const contactSchema = z.object({
  number: z.string().optional(),
  username: z.string().optional(),
}).describe(`signal 电话号码或用户名 一般情况下不能同时指定二者
  电话号码符合 E164 规范，即以 + 开头的国际电话号码格式，例如 +8613111111111 
  用户名为 Signal 用户名，例如 s131.01 其后缀 .01 的部分是 Signal 用户名的后缀，表示该用户在 Signal 中的唯一标识符。`);

export type contactType = z.infer<typeof contactSchema>;

export const updateContactArgumentsSchema = z.object({
  name: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  nickGivenName: z.string().optional(),
  nickFamilyName: z.string().optional(),
  note: z.string().optional(),
}).describe(`更新联系人信息的参数
  name: 联系人名称
  givenName: 联系人名
  familyName: 联系人姓
  nickGivenName: 联系人昵称名
  nickFamilyName: 联系人昵称姓
  note: 联系人备注`);
export type updateContactArgumentsType = z.infer<typeof updateContactArgumentsSchema>;
