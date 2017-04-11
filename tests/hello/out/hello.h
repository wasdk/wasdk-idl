#ifndef __HELLO_H
#define __HELLO_H

namespace Hello {
class Universe;
// Universe class definition
class Universe
{
    static int _typeid;
  public:
    Universe();
    ~Universe();
    static Universe* Create();
    void Destroy();
    bool giveAnswer(int* result);
// additional Universe members
  private:
};
// end of Universe class definition
#endif // __HELLO_H