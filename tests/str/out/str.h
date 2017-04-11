#ifndef __STR_H
#define __STR_H

namespace Str {
class Test;
// Test class definition
class Test
{
    static int _typeid;
  public:
    Test();
    ~Test();
    void Destroy();
    static bool createAndFill(unsigned int size, unsigned char fill, unsigned int* result);
    static bool destroy(unsigned int ptr);
    static bool flip(const wasmbase::StringBox& s, wasmbase::StringBox* result);
// additional Test members
  private:
};
// end of Test class definition
#endif // __STR_H